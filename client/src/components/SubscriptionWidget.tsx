import { useEffect, useRef, useState } from 'react'
import { requestWithFetch } from '../services/http'

type Subscription = {
  id: string
  name: string
  amount: number
  cycle: 'monthly' | 'yearly'
  note?: string
}

type SubsApiResponse = {
  ok: boolean
  items: Subscription[]
  updatedAt: string | null
  message?: string
}

function genId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function SubscriptionWidget() {
  const [items, setItems] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addCycle, setAddCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [addNote, setAddNote] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editCycle, setEditCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [editNote, setEditNote] = useState('')

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await requestWithFetch<SubsApiResponse>('/api/subscriptions')
      if (isMountedRef.current) {
        setItems(Array.isArray(data.items) ? data.items : [])
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : '读取失败')
      }
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }

  async function save(next: Subscription[]) {
    setSaving(true)
    setError(null)
    try {
      const data = await requestWithFetch<SubsApiResponse>('/api/subscriptions', {
        method: 'PUT',
        body: JSON.stringify({ items: next }),
      })
      if (isMountedRef.current) {
        setItems(Array.isArray(data.items) ? data.items : next)
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : '保存失败')
      }
    } finally {
      if (isMountedRef.current) setSaving(false)
    }
  }

  function handleAdd() {
    const name = addName.trim()
    const amount = parseFloat(addAmount)
    if (!name || !Number.isFinite(amount) || amount < 0) return
    const next: Subscription[] = [
      ...items,
      { id: genId(), name, amount, cycle: addCycle, note: addNote.trim() || undefined },
    ]
    void save(next)
    setAddName('')
    setAddAmount('')
    setAddCycle('monthly')
    setAddNote('')
    setShowAdd(false)
  }

  function startEdit(item: Subscription) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditAmount(String(item.amount))
    setEditCycle(item.cycle)
    setEditNote(item.note || '')
  }

  function handleSaveEdit(item: Subscription) {
    const name = editName.trim()
    const amount = parseFloat(editAmount)
    if (!name || !Number.isFinite(amount) || amount < 0) return
    const next = items.map((s) =>
      s.id === item.id
        ? { ...s, name, amount, cycle: editCycle, note: editNote.trim() || undefined }
        : s,
    )
    void save(next)
    setEditingId(null)
  }

  function handleDelete(id: string) {
    void save(items.filter((s) => s.id !== id))
  }

  const monthlyTotal = items.reduce((sum, s) => {
    return sum + (s.cycle === 'monthly' ? s.amount : s.amount / 12)
  }, 0)
  const yearlyTotal = items.reduce((sum, s) => {
    return sum + (s.cycle === 'yearly' ? s.amount : s.amount * 12)
  }, 0)

  return (
    <div className="subs-widget">
      <div className="subs-header">
        <span className="subs-title">订阅管理</span>
        {!loading && items.length > 0 && (
          <span className="subs-summary">
            月均 ¥{monthlyTotal.toFixed(0)} · 年 ¥{yearlyTotal.toFixed(0)}
          </span>
        )}
      </div>

      {error && <p className="subs-error">{error}</p>}
      {loading && <p className="subs-muted">加载中…</p>}

      {!loading && (
        <ul className="subs-list">
          {items.map((item) =>
            editingId === item.id ? (
              <li key={item.id} className="subs-item subs-item-editing">
                <input
                  className="subs-input"
                  placeholder="名称"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                  autoFocus
                />
                <div className="subs-row">
                  <input
                    className="subs-input subs-amount-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="金额"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    disabled={saving}
                  />
                  <select
                    className="subs-select"
                    value={editCycle}
                    onChange={(e) => setEditCycle(e.target.value as 'monthly' | 'yearly')}
                    disabled={saving}
                  >
                    <option value="monthly">每月</option>
                    <option value="yearly">每年</option>
                  </select>
                </div>
                <input
                  className="subs-input subs-note-input"
                  placeholder="备注（选填）"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  disabled={saving}
                />
                <div className="subs-edit-btns">
                  <button type="button" className="subs-btn subs-btn-save" disabled={saving} onClick={() => handleSaveEdit(item)}>保存</button>
                  <button type="button" className="subs-btn" disabled={saving} onClick={() => setEditingId(null)}>取消</button>
                </div>
              </li>
            ) : (
              <li key={item.id} className="subs-item">
                <div className="subs-item-main">
                  <span className="subs-name">{item.name}</span>
                  {item.note && <span className="subs-note">{item.note}</span>}
                </div>
                <div className="subs-item-right">
                  <span className="subs-amount">¥{item.amount.toLocaleString()}</span>
                  <span className={`subs-cycle-badge subs-cycle-${item.cycle}`}>
                    {item.cycle === 'monthly' ? '月' : '年'}
                  </span>
                  <button type="button" className="subs-icon-btn" disabled={saving} title="编辑" onClick={() => startEdit(item)}>✎</button>
                  <button type="button" className="subs-icon-btn subs-icon-btn-del" disabled={saving} title="删除" onClick={() => handleDelete(item.id)}>✕</button>
                </div>
              </li>
            ),
          )}

          {items.length === 0 && !showAdd && (
            <li className="subs-empty">暂无订阅，点击下方 + 添加</li>
          )}
        </ul>
      )}

      {!loading && (
        showAdd ? (
          <div className="subs-add-form">
            <input
              className="subs-input"
              placeholder="订阅名称（如 Netflix）"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              disabled={saving}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            />
            <div className="subs-row">
              <input
                className="subs-input subs-amount-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="金额"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                disabled={saving}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
              <select
                className="subs-select"
                value={addCycle}
                onChange={(e) => setAddCycle(e.target.value as 'monthly' | 'yearly')}
                disabled={saving}
              >
                <option value="monthly">每月</option>
                <option value="yearly">每年</option>
              </select>
            </div>
            <input
              className="subs-input subs-note-input"
              placeholder="备注（选填）"
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
              disabled={saving}
            />
            <div className="subs-add-btns">
              <button type="button" className="subs-btn subs-btn-save" disabled={saving || !addName.trim() || !addAmount} onClick={handleAdd}>添加</button>
              <button type="button" className="subs-btn" disabled={saving} onClick={() => { setShowAdd(false); setAddName(''); setAddAmount(''); setAddNote('') }}>取消</button>
            </div>
          </div>
        ) : (
          <button type="button" className="subs-add-trigger" onClick={() => setShowAdd(true)}>
            + 添加订阅
          </button>
        )
      )}
    </div>
  )
}
