import { useEffect, useState } from 'react'
import {
  formatTodoTime,
  getStickyColorIndex,
  toDateStartLocalValue,
  toDateTimeLocalValue,
  useTodos,
  type TodoItem,
} from '../hooks/useTodos'

/**
 * 完整的便利贴待办看板（工作台「待办看板」标签使用）。
 * 支持新增 / 完成 / 置顶 / 隐藏 / 行内编辑 / 删除，行为与原首页保持一致。
 */
export function TodoBoard() {
  const { items, loading, saving, error, createTodo, patchTodo, removeTodo } = useTodos()

  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoTime, setNewTodoTime] = useState('')
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editingTodoText, setEditingTodoText] = useState('')
  const [editingTodoTime, setEditingTodoTime] = useState('')
  const [showHidden, setShowHidden] = useState(false)

  async function handleCreate() {
    const text = newTodoText.trim()
    if (!text) return
    const ok = await createTodo(text, newTodoTime || undefined)
    if (ok) {
      setNewTodoText('')
      setNewTodoTime('')
    }
  }

  function startEdit(item: TodoItem) {
    setEditingTodoId(item.id)
    setEditingTodoText(item.text)
    setEditingTodoTime(toDateStartLocalValue(item.time || item.createdAt))
  }

  function resetEdit() {
    setEditingTodoId(null)
    setEditingTodoText('')
    setEditingTodoTime('')
  }

  async function saveEdit(item: TodoItem, draft?: { text?: string; time?: string }) {
    const text = (draft?.text ?? editingTodoText).trim()
    const time = (draft?.time ?? editingTodoTime).trim()
    const normalizedCurrentTime = toDateTimeLocalValue(item.time || item.createdAt)
    const textChanged = text && text !== item.text
    const timeChanged = time !== normalizedCurrentTime
    if (!text || (!textChanged && !timeChanged)) {
      resetEdit()
      return
    }
    const ok = await patchTodo(item.id, { text, time: time || undefined })
    if (ok) resetEdit()
  }

  // 点击便利贴外部时自动保存当前编辑项
  useEffect(() => {
    if (!editingTodoId) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      const targetElement = event.target as HTMLElement | null
      const editContainer = document.querySelector(
        `[data-todo-edit-container="${editingTodoId}"]`,
      ) as HTMLElement | null
      if (editContainer && target && editContainer.contains(target)) {
        const clickedInteractive = targetElement?.closest(
          'input, textarea, select, button, .todo-time-input-shell',
        )
        if (clickedInteractive) return
      }
      const currentItem = items.find((item) => item.id === editingTodoId)
      if (!currentItem) return
      window.setTimeout(() => {
        const textInput = document.querySelector(
          `[data-todo-edit-text-for="${editingTodoId}"]`,
        ) as HTMLTextAreaElement | null
        const timeInput = document.querySelector(
          `input[data-todo-edit-time-for="${editingTodoId}"]`,
        ) as HTMLInputElement | null
        void saveEdit(currentItem, {
          text: textInput?.value ?? editingTodoText,
          time: timeInput?.value ?? editingTodoTime,
        })
      }, 0)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTodoId, editingTodoText, editingTodoTime, items])

  const pinnedTodos = items.filter((i) => i.pinned && !i.hidden)
  const regularTodos = items.filter((i) => !i.pinned && !i.hidden)
  const hiddenTodos = items.filter((i) => i.hidden)
  const visibleCount = items.filter((i) => !i.hidden).length
  const doneCount = items.filter((i) => !i.hidden && i.done).length

  function renderStickyNote(item: TodoItem, isInHiddenSection = false) {
    const colorIndex = getStickyColorIndex(item.id)
    const isEditing = editingTodoId === item.id
    return (
      <div
        key={item.id}
        className={['sticky-note', `sticky-note-${colorIndex}`, item.done ? 'is-done' : '', isEditing ? 'is-editing' : '', item.pinned && !isInHiddenSection ? 'is-pinned' : ''].filter(Boolean).join(' ')}
      >
        {item.pinned && !isInHiddenSection && (
          <span className="sticky-pin-badge" title="已置顶">📌</span>
        )}
        {isEditing ? (
          <div className="sticky-note-edit-mode" data-todo-edit-container={item.id}>
            <textarea
              className="sticky-note-textarea"
              autoFocus
              data-todo-edit-text-for={item.id}
              value={editingTodoText}
              disabled={saving}
              onChange={(e) => setEditingTodoText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') resetEdit()
              }}
            />
            <div
              className="todo-time-input-shell"
              onClick={() => {
                const input = document.querySelector(
                  `input[data-todo-edit-time-for="${item.id}"]`,
                ) as HTMLInputElement | null
                if (!input || input.disabled) return
                input.focus()
                if (typeof input.showPicker === 'function') input.showPicker()
              }}
            >
              <input
                className="todo-input todo-time-input todo-edit-time-input"
                type="datetime-local"
                data-todo-edit-time-for={item.id}
                value={editingTodoTime}
                disabled={saving}
                onChange={(e) => setEditingTodoTime(e.target.value)}
              />
            </div>
            <div className="sticky-note-edit-btns">
              <button type="button" disabled={saving} onClick={() => void saveEdit(item)}>
                保存
              </button>
              <button type="button" disabled={saving} onClick={resetEdit}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={`sticky-note-text${item.done ? ' done' : ''}`}>{item.text}</p>
            <span className="sticky-note-time">{formatTodoTime(item.time || item.createdAt)}</span>
            <div className="sticky-note-actions">
              {!isInHiddenSection ? (
                <>
                  <button className="sticky-note-btn" type="button" disabled={saving} onClick={() => void patchTodo(item.id, { done: !item.done })}>
                    {item.done ? '↩ 撤销' : '✓ 完成'}
                  </button>
                  <button className="sticky-note-btn" type="button" disabled={saving} onClick={() => void patchTodo(item.id, { pinned: !item.pinned })}>
                    {item.pinned ? '取消置顶' : '📌 置顶'}
                  </button>
                  <button className="sticky-note-btn" type="button" disabled={saving} onClick={() => void patchTodo(item.id, { hidden: !item.hidden })}>
                    隐藏
                  </button>
                  <button className="sticky-note-btn" type="button" disabled={saving} onClick={() => startEdit(item)}>
                    编辑
                  </button>
                  <button className="sticky-note-btn sticky-note-btn-danger" type="button" disabled={saving} onClick={() => void removeTodo(item.id)}>
                    删除
                  </button>
                </>
              ) : (
                <>
                  <button className="sticky-note-btn" type="button" disabled={saving} onClick={() => void patchTodo(item.id, { hidden: !item.hidden })}>
                    恢复显示
                  </button>
                  <button className="sticky-note-btn sticky-note-btn-danger" type="button" disabled={saving} onClick={() => void removeTodo(item.id)}>
                    删除
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="home-board-area">
      <div className="home-board-topbar">
        <div className="home-board-title-group">
          <h2>待办事项</h2>
          {!loading && visibleCount > 0 && (
            <span className="todo-board-count">{doneCount} / {visibleCount} 完成</span>
          )}
          {loading && <span className="muted todo-board-loading">加载中…</span>}
        </div>
        <div className="home-board-add-row">
          <input
            className="todo-input"
            value={newTodoText}
            placeholder="输入待办内容，回车添加"
            disabled={saving}
            onChange={(event) => setNewTodoText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleCreate()
              }
            }}
          />
          <input
            className="todo-input todo-time-input home-board-time-input"
            type="datetime-local"
            value={newTodoTime}
            disabled={saving}
            onChange={(event) => setNewTodoTime(event.target.value)}
          />
          <button type="button" disabled={saving || !newTodoText.trim()} onClick={() => void handleCreate()}>
            添加
          </button>
        </div>
        {hiddenTodos.length > 0 && (
          <button type="button" className="todo-hidden-toggle" onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? '收起已隐藏' : `${hiddenTodos.length} 个已隐藏`}
          </button>
        )}
      </div>

      <div className="home-board-notes">
        {error ? <p className="weather-error">待办操作失败：{error}</p> : null}
        {!loading && visibleCount === 0 && <p className="muted">暂无待办，先加一条吧。</p>}

        {pinnedTodos.length > 0 && (
          <div className="sticky-section">
            <div className="sticky-section-label">📌 置顶</div>
            <div className="sticky-board">{pinnedTodos.map((item) => renderStickyNote(item))}</div>
          </div>
        )}

        {regularTodos.length > 0 && (
          <div className={pinnedTodos.length > 0 ? 'sticky-section' : ''}>
            {pinnedTodos.length > 0 && <div className="sticky-section-label">其他待办</div>}
            <div className="sticky-board">{regularTodos.map((item) => renderStickyNote(item))}</div>
          </div>
        )}

        {showHidden && hiddenTodos.length > 0 && (
          <div className="sticky-section sticky-section-dimmed">
            <div className="sticky-section-label">已隐藏</div>
            <div className="sticky-board">{hiddenTodos.map((item) => renderStickyNote(item, true))}</div>
          </div>
        )}
      </div>
    </div>
  )
}
