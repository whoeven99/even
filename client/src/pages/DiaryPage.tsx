import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestWithFetch } from '../services/http'

type Note = {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

type NotesApiResponse = {
  ok: boolean
  notes: Note[]
  message?: string
}

type AiSearchResult = {
  id: string
  reason: string
}

type AiSearchApiResponse = {
  ok: boolean
  results: AiSearchResult[]
  message?: string
}

type ListNote = Note & { aiReason?: string; aiMatched?: boolean }

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function getPreview(note: Note): string {
  if (note.title) return note.title
  const firstLine = note.content.split('\n')[0]?.trim() || ''
  return firstLine.slice(0, 45) || '（空白记录）'
}

export function DiaryPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'text' | 'ai'>('text')
  const [aiSearching, setAiSearching] = useState(false)
  const [aiSearchError, setAiSearchError] = useState<string | null>(null)
  const [aiResults, setAiResults] = useState<AiSearchResult[] | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const contentRef = useRef<HTMLTextAreaElement>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const loadNotes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await requestWithFetch<NotesApiResponse>('/api/notes')
      if (isMountedRef.current) setNotes(Array.isArray(data.notes) ? data.notes : [])
    } catch (err) {
      if (isMountedRef.current) setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void loadNotes() }, [loadNotes])

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId])

  const listNotes = useMemo((): ListNote[] => {
    if (searchMode === 'ai' && aiResults !== null) {
      const reasonMap = new Map(aiResults.map((r) => [r.id, r.reason]))
      const matched: ListNote[] = []
      const rest: ListNote[] = []
      for (const n of notes) {
        if (reasonMap.has(n.id)) matched.push({ ...n, aiReason: reasonMap.get(n.id), aiMatched: true })
        else rest.push(n)
      }
      return [...matched, ...rest]
    }
    if (searchMode === 'text' && searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    }
    return notes
  }, [notes, searchMode, searchQuery, aiResults])

  function startNew() {
    setIsNew(true)
    setIsEditing(true)
    setSelectedId(null)
    setEditTitle('')
    setEditContent('')
    setDeleteConfirm(false)
    setTimeout(() => contentRef.current?.focus(), 50)
  }

  function selectNote(note: Note) {
    setSelectedId(note.id)
    setIsEditing(false)
    setIsNew(false)
    setDeleteConfirm(false)
    setError(null)
  }

  function startEdit() {
    if (!selectedNote) return
    setEditTitle(selectedNote.title)
    setEditContent(selectedNote.content)
    setIsEditing(true)
    setIsNew(false)
    setTimeout(() => contentRef.current?.focus(), 50)
  }

  function cancelEdit() {
    setIsEditing(false)
    setIsNew(false)
    setEditTitle('')
    setEditContent('')
    if (isNew) setSelectedId(null)
  }

  async function handleSave() {
    const title = editTitle.trim()
    const content = editContent.trim()
    if (!content && !title) return
    setSaving(true)
    setError(null)
    try {
      if (isNew) {
        const data = await requestWithFetch<NotesApiResponse>('/api/notes', {
          method: 'POST',
          body: JSON.stringify({ title, content }),
        })
        const saved = Array.isArray(data.notes) ? data.notes : []
        if (isMountedRef.current) {
          setNotes(saved)
          setIsEditing(false)
          setIsNew(false)
          setSelectedId(saved[0]?.id ?? null)
        }
      } else if (selectedId) {
        const data = await requestWithFetch<NotesApiResponse>(`/api/notes/${encodeURIComponent(selectedId)}`, {
          method: 'PUT',
          body: JSON.stringify({ title, content }),
        })
        if (isMountedRef.current) {
          setNotes(Array.isArray(data.notes) ? data.notes : [])
          setIsEditing(false)
        }
      }
    } catch (err) {
      if (isMountedRef.current) setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      if (isMountedRef.current) setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedId) return
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    setSaving(true)
    setError(null)
    try {
      const data = await requestWithFetch<NotesApiResponse>(`/api/notes/${encodeURIComponent(selectedId)}`, {
        method: 'DELETE',
      })
      if (isMountedRef.current) {
        const remaining = Array.isArray(data.notes) ? data.notes : []
        setNotes(remaining)
        setSelectedId(null)
        setDeleteConfirm(false)
      }
    } catch (err) {
      if (isMountedRef.current) setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      if (isMountedRef.current) setSaving(false)
    }
  }

  async function handleAiSearch() {
    const q = searchQuery.trim()
    if (!q || aiSearching) return
    setAiSearching(true)
    setAiSearchError(null)
    setAiResults(null)
    try {
      const data = await requestWithFetch<AiSearchApiResponse>('/api/notes/ai-search', {
        method: 'POST',
        body: JSON.stringify({ query: q }),
      })
      if (isMountedRef.current) setAiResults(data.results ?? [])
    } catch (err) {
      if (isMountedRef.current) setAiSearchError(err instanceof Error ? err.message : 'AI 搜索失败')
    } finally {
      if (isMountedRef.current) setAiSearching(false)
    }
  }

  function clearSearch() {
    setSearchQuery('')
    setAiResults(null)
    setAiSearchError(null)
  }

  const aiMatchedCount = aiResults?.length ?? 0

  return (
    <div className="diary-page">
      {/* ── 左侧列表面板 ── */}
      <div className="diary-sidebar">
        <div className="diary-sidebar-top">
          <div className="diary-search-wrap">
            <input
              className="diary-search-input"
              placeholder={searchMode === 'ai' ? 'AI 语义搜索，回车执行…' : '输入关键词过滤…'}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (searchMode === 'text') setAiResults(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchMode === 'ai') void handleAiSearch()
                if (e.key === 'Escape') clearSearch()
              }}
            />
            {searchMode === 'ai' && (
              <button
                type="button"
                className="diary-search-go"
                disabled={!searchQuery.trim() || aiSearching}
                onClick={handleAiSearch}
                title="执行 AI 搜索"
              >
                {aiSearching ? '…' : '搜'}
              </button>
            )}
            {(searchQuery || aiResults !== null) && (
              <button type="button" className="diary-search-clear" onClick={clearSearch} title="清除">✕</button>
            )}
          </div>

          <div className="diary-toolbar">
            <div className="diary-mode-tabs">
              <button
                type="button"
                className={`diary-mode-tab${searchMode === 'text' ? ' active' : ''}`}
                onClick={() => { setSearchMode('text'); setAiResults(null) }}
              >文本</button>
              <button
                type="button"
                className={`diary-mode-tab${searchMode === 'ai' ? ' active' : ''}`}
                onClick={() => setSearchMode('ai')}
              >✨ AI</button>
            </div>
            <span className="diary-count">{listNotes.length} 条</span>
          </div>

          {aiSearchError && <p className="diary-ai-error">{aiSearchError}</p>}
          {searchMode === 'ai' && aiResults !== null && !aiSearching && (
            <p className="diary-ai-status">
              {aiMatchedCount > 0 ? `找到 ${aiMatchedCount} 条匹配` : '未找到相关记录'}
            </p>
          )}
        </div>

        <div className="diary-list">
          {loading && <p className="diary-muted">加载中…</p>}
          {!loading && listNotes.length === 0 && (
            <p className="diary-muted">{searchQuery ? '无匹配记录' : '暂无记录'}</p>
          )}
          {listNotes.map((note) => (
            <button
              key={note.id}
              type="button"
              className={[
                'diary-list-item',
                selectedId === note.id ? 'active' : '',
                note.aiMatched ? 'ai-matched' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => selectNote(note)}
            >
              <span className="diary-item-preview">{getPreview(note)}</span>
              {note.aiReason && (
                <span className="diary-item-reason">{note.aiReason}</span>
              )}
              <span className="diary-item-date">{formatDate(note.updatedAt)}</span>
            </button>
          ))}
        </div>

        <button type="button" className="diary-new-btn" onClick={startNew}>
          + 新建记录
        </button>
      </div>

      {/* ── 右侧内容面板 ── */}
      <div className="diary-panel">
        {!isEditing && !selectedNote && (
          <div className="diary-placeholder">
            <div className="diary-placeholder-icon">📝</div>
            <p>选择左侧记录查看</p>
            <p className="diary-placeholder-sub">或</p>
            <button type="button" className="diary-btn diary-btn-primary" onClick={startNew}>
              + 新建记录
            </button>
          </div>
        )}

        {isEditing && (
          <div className="diary-editor">
            <input
              className="diary-editor-title"
              placeholder="标题（选填）"
              value={editTitle}
              disabled={saving}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); contentRef.current?.focus() } }}
            />
            <textarea
              ref={contentRef}
              className="diary-editor-body"
              placeholder="在这里记录任何内容…&#10;&#10;支持多行文字，可以记录配置流程、账号密码、操作步骤等。"
              value={editContent}
              disabled={saving}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault()
                  void handleSave()
                }
              }}
            />
            {error && <p className="diary-error">{error}</p>}
            <div className="diary-editor-footer">
              <span className="diary-editor-hint">Ctrl+S 保存</span>
              <div className="diary-editor-actions">
                <button
                  type="button"
                  className="diary-btn diary-btn-primary"
                  disabled={saving || (!editContent.trim() && !editTitle.trim())}
                  onClick={handleSave}
                >
                  {saving ? '保存中…' : '保存'}
                </button>
                <button type="button" className="diary-btn" disabled={saving} onClick={cancelEdit}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {!isEditing && selectedNote && (
          <div className="diary-viewer">
            <div className="diary-viewer-header">
              {selectedNote.title
                ? <h2 className="diary-viewer-title">{selectedNote.title}</h2>
                : <h2 className="diary-viewer-title diary-viewer-title--empty">（无标题）</h2>
              }
              <div className="diary-viewer-meta">
                <span>创建于 {formatDate(selectedNote.createdAt)}</span>
                {selectedNote.updatedAt !== selectedNote.createdAt && (
                  <span>· 更新于 {formatDate(selectedNote.updatedAt)}</span>
                )}
              </div>
            </div>

            <pre className="diary-viewer-body">{selectedNote.content}</pre>

            {error && <p className="diary-error">{error}</p>}

            <div className="diary-viewer-footer">
              <button type="button" className="diary-btn diary-btn-primary" onClick={startEdit}>
                编辑
              </button>
              {deleteConfirm ? (
                <div className="diary-delete-confirm">
                  <span className="diary-delete-confirm-label">确认删除？</span>
                  <button type="button" className="diary-btn diary-btn-danger" disabled={saving} onClick={handleDelete}>
                    {saving ? '删除中…' : '确认'}
                  </button>
                  <button type="button" className="diary-btn" disabled={saving} onClick={() => setDeleteConfirm(false)}>
                    取消
                  </button>
                </div>
              ) : (
                <button type="button" className="diary-btn diary-btn-ghost-danger" disabled={saving} onClick={() => setDeleteConfirm(true)}>
                  删除
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
