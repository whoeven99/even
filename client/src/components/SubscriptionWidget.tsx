import { useEffect, useMemo, useRef, useState } from 'react'
import { requestWithFetch } from '../services/http'

type RecurringExpense = {
  id: string
  name: string
  amount: number
  cycle: 'monthly' | 'yearly'
  category: string
  note?: string
}

type SubsApiResponse = {
  ok: boolean
  items: RecurringExpense[]
  updatedAt: string | null
  message?: string
}

type FormState = {
  name: string
  amount: string
  cycle: 'monthly' | 'yearly'
  category: string
  note: string
}

const CATEGORIES = [
  { key: '住房', icon: '🏠' },
  { key: '水电', icon: '🔌' },
  { key: '通讯', icon: '📱' },
  { key: '数字服务', icon: '💻' },
  { key: '健康', icon: '🏋️' },
  { key: '交通', icon: '🚗' },
  { key: '保险', icon: '🛡️' },
  { key: '还款', icon: '💳' },
  { key: '其他', icon: '📦' },
]

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon]))

function getCatIcon(key: string) {
  return CAT_MAP[key] ?? '📦'
}

function toMonthly(item: RecurringExpense) {
  return item.cycle === 'monthly' ? item.amount : item.amount / 12
}

function genId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const EMPTY_FORM: FormState = {
  name: '',
  amount: '',
  cycle: 'monthly',
  category: '住房',
  note: '',
}

export function SubscriptionWidget() {
  const [items, setItems] = useState<RecurringExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await requestWithFetch<SubsApiResponse>('/api/subscriptions')
      if (isMountedRef.current) setItems(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      if (isMountedRef.current) setError(err instanceof Error ? err.message : '读取失败')
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }

  async function persist(next: RecurringExpense[]) {
    setSaving(true)
    setError(null)
    try {
      const data = await requestWithFetch<SubsApiResponse>('/api/subscriptions', {
        method: 'PUT',
        body: JSON.stringify({ items: next }),
      })
      if (isMountedRef.current) setItems(Array.isArray(data.items) ? data.items : next)
    } catch (err) {
      if (isMountedRef.current) setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      if (isMountedRef.current) setSaving(false)
    }
  }

  function formToItem(id: string, f: FormState): RecurringExpense | null {
    const name = f.name.trim()
    const amount = parseFloat(f.amount)
    if (!name || !Number.isFinite(amount) || amount < 0) return null
    return { id, name, amount, cycle: f.cycle, category: f.category, note: f.note.trim() || undefined }
  }

  function handleAdd() {
    const item = formToItem(genId(), addForm)
    if (!item) return
    void persist([...items, item])
    setAddForm(EMPTY_FORM)
    setShowAdd(false)
  }

  function startEdit(item: RecurringExpense) {
    setEditingId(item.id)
    setEditForm({ name: item.name, amount: String(item.amount), cycle: item.cycle, category: item.category, note: item.note || '' })
  }

  function handleSaveEdit() {
    if (!editingId) return
    const updated = formToItem(editingId, editForm)
    if (!updated) return
    void persist(items.map((s) => (s.id === editingId ? updated : s)))
    setEditingId(null)
  }

  function handleDelete(id: string) {
    void persist(items.filter((s) => s.id !== id))
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const monthlyTotal = useMemo(() => items.reduce((s, i) => s + toMonthly(i), 0), [items])
  const yearlyTotal = monthlyTotal * 12

  const groups = useMemo(() => {
    const knownOrder = CATEGORIES.map((c) => c.key)
    const allCategories = [...new Set([...knownOrder, ...items.map((i) => i.category)])]
    return allCategories
      .map((key) => {
        const groupItems = items.filter((i) => i.category === key)
        const subtotal = groupItems.reduce((s, i) => s + toMonthly(i), 0)
        return { key, icon: getCatIcon(key), items: groupItems, subtotal }
      })
      .filter((g) => g.items.length > 0)
  }, [items])

  function renderForm(form: FormState, onChange: (f: FormState) => void, onSubmit: () => void, onCancel: () => void, submitLabel: string) {
    return (
      <div className="subs-form">
        <div className="subs-form-row">
          <input
            className="subs-input subs-input-name"
            placeholder="支出名称"
            value={form.name}
            disabled={saving}
            autoFocus
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
          />
          <select
            className="subs-select"
            value={form.cycle}
            disabled={saving}
            onChange={(e) => onChange({ ...form, cycle: e.target.value as 'monthly' | 'yearly' })}
          >
            <option value="monthly">每月</option>
            <option value="yearly">每年</option>
          </select>
        </div>
        <div className="subs-form-row">
          <input
            className="subs-input subs-input-amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="金额 ¥"
            value={form.amount}
            disabled={saving}
            onChange={(e) => onChange({ ...form, amount: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
          />
          <select
            className="subs-select subs-select-cat"
            value={form.category}
            disabled={saving}
            onChange={(e) => onChange({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.icon} {c.key}</option>
            ))}
          </select>
        </div>
        <input
          className="subs-input subs-input-note"
          placeholder="备注（选填）"
          value={form.note}
          disabled={saving}
          onChange={(e) => onChange({ ...form, note: e.target.value })}
        />
        <div className="subs-form-btns">
          <button type="button" className="subs-btn subs-btn-primary" disabled={saving || !form.name.trim() || !form.amount} onClick={onSubmit}>{submitLabel}</button>
          <button type="button" className="subs-btn" disabled={saving} onClick={onCancel}>取消</button>
        </div>
      </div>
    )
  }

  return (
    <div className="subs-widget">
      <div className="subs-header">
        <span className="subs-title">固定支出</span>
        {!loading && items.length > 0 && (
          <span className="subs-summary">月 ¥{monthlyTotal.toFixed(0)} · 年 ¥{yearlyTotal.toFixed(0)}</span>
        )}
      </div>

      {error && <p className="subs-error">{error}</p>}
      {loading && <p className="subs-muted">加载中…</p>}

      {!loading && (
        <>
          <div className="subs-groups">
            {groups.length === 0 && !showAdd && (
              <p className="subs-empty">暂无记录，点击下方添加</p>
            )}

            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.key)
              return (
                <div key={group.key} className="subs-group">
                  <button
                    type="button"
                    className="subs-group-header"
                    onClick={() => toggleCollapse(group.key)}
                  >
                    <span className="subs-group-icon">{group.icon}</span>
                    <span className="subs-group-label">{group.key}</span>
                    <span className="subs-group-subtotal">¥{group.subtotal.toFixed(0)}/月</span>
                    <span className="subs-group-chevron">{isCollapsed ? '▶' : '▼'}</span>
                  </button>

                  {!isCollapsed && (
                    <ul className="subs-group-items">
                      {group.items.map((item) =>
                        editingId === item.id ? (
                          <li key={item.id} className="subs-item subs-item-editing">
                            {renderForm(
                              editForm,
                              setEditForm,
                              handleSaveEdit,
                              () => setEditingId(null),
                              '保存',
                            )}
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
                    </ul>
                  )}
                </div>
              )
            })}
          </div>

          {showAdd
            ? renderForm(addForm, setAddForm, handleAdd, () => { setShowAdd(false); setAddForm(EMPTY_FORM) }, '添加')
            : (
              <button type="button" className="subs-add-trigger" onClick={() => setShowAdd(true)}>
                + 添加支出
              </button>
            )}
        </>
      )}
    </div>
  )
}
