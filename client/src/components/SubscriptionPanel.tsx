import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { requestWithFetch } from '../services/http'

type SubscriptionCycle = 'monthly' | 'yearly'

type SubscriptionItem = {
  id: string
  name: string
  amount: number
  cycle: SubscriptionCycle
  currency: string
  note: string
  active: boolean
  createdAt: string
  updatedAt: string
}

type SubApiResponse = {
  ok: boolean
  items: SubscriptionItem[]
  updatedAt: string | null
  message?: string
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function toMonthlyAmount(item: SubscriptionItem): number {
  return item.cycle === 'yearly' ? item.amount / 12 : item.amount
}

export function SubscriptionPanel() {
  const [items, setItems] = useState<SubscriptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newCycle, setNewCycle] = useState<SubscriptionCycle>('monthly')
  const [newCurrency, setNewCurrency] = useState('CNY')
  const [newNote, setNewNote] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editCycle, setEditCycle] = useState<SubscriptionCycle>('monthly')
  const [editCurrency, setEditCurrency] = useState('CNY')
  const [editNote, setEditNote] = useState('')

  const loadSubscriptions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await requestWithFetch<SubApiResponse>('/api/subscriptions')
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '订阅读取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSubscriptions()
  }, [loadSubscriptions])

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    const amount = Number(newAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('请输入有效的费用金额')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const data = await requestWithFetch<SubApiResponse>('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ name, amount, cycle: newCycle, currency: newCurrency, note: newNote.trim() }),
      })
      setItems(Array.isArray(data.items) ? data.items : [])
      setNewName('')
      setNewAmount('')
      setNewCycle('monthly')
      setNewCurrency('CNY')
      setNewNote('')
      setShowAddForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '订阅新增失败')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(item: SubscriptionItem) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditAmount(String(item.amount))
    setEditCycle(item.cycle)
    setEditCurrency(item.currency)
    setEditNote(item.note)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditAmount('')
    setEditCycle('monthly')
    setEditCurrency('CNY')
    setEditNote('')
  }

  async function handleSaveEdit(item: SubscriptionItem) {
    const name = editName.trim()
    if (!name) return
    const amount = Number(editAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('请输入有效的费用金额')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const data = await requestWithFetch<SubApiResponse>(
        `/api/subscriptions/${encodeURIComponent(item.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ name, amount, cycle: editCycle, currency: editCurrency, note: editNote.trim() }),
        },
      )
      setItems(Array.isArray(data.items) ? data.items : [])
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : '订阅更新失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item: SubscriptionItem) {
    setSaving(true)
    setError(null)
    try {
      const data = await requestWithFetch<SubApiResponse>(
        `/api/subscriptions/${encodeURIComponent(item.id)}`,
        { method: 'DELETE' },
      )
      setItems(Array.isArray(data.items) ? data.items : [])
      if (editingId === item.id) cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : '订阅删除失败')
    } finally {
      setSaving(false)
    }
  }

  const activeItems = items.filter((i) => i.active)
  const totalMonthly = activeItems.reduce((sum, i) => sum + toMonthlyAmount(i), 0)
  const totalYearly = totalMonthly * 12

  return (
    <div className="sub-panel">
      <div className="sub-panel-header">
        <h3 className="sub-panel-title">订阅管家</h3>
        <button
          type="button"
          className="sub-add-btn"
          disabled={saving}
          onClick={() => {
            setShowAddForm((v) => !v)
            setError(null)
          }}
        >
          {showAddForm ? '取消' : '＋ 添加'}
        </button>
      </div>

      {activeItems.length > 0 && (
        <div className="sub-summary">
          <div className="sub-summary-item">
            <span className="sub-summary-label">月均支出</span>
            <span className="sub-summary-value">{formatAmount(totalMonthly, 'CNY')}</span>
          </div>
          <div className="sub-summary-divider" />
          <div className="sub-summary-item">
            <span className="sub-summary-label">年均支出</span>
            <span className="sub-summary-value">{formatAmount(totalYearly, 'CNY')}</span>
          </div>
        </div>
      )}

      {showAddForm && (
        <form className="sub-add-form" onSubmit={(e) => void handleAdd(e)}>
          <input
            className="sub-input"
            placeholder="订阅名称"
            value={newName}
            autoFocus
            disabled={saving}
            maxLength={80}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="sub-add-row">
            <input
              className="sub-input sub-amount-input"
              placeholder="费用"
              type="number"
              min="0"
              step="0.01"
              value={newAmount}
              disabled={saving}
              onChange={(e) => setNewAmount(e.target.value)}
            />
            <select
              className="sub-select"
              value={newCurrency}
              disabled={saving}
              onChange={(e) => setNewCurrency(e.target.value)}
            >
              <option value="CNY">CNY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="HKD">HKD</option>
              <option value="JPY">JPY</option>
            </select>
            <select
              className="sub-select"
              value={newCycle}
              disabled={saving}
              onChange={(e) => setNewCycle(e.target.value as SubscriptionCycle)}
            >
              <option value="monthly">每月</option>
              <option value="yearly">每年</option>
            </select>
          </div>
          <input
            className="sub-input sub-note-input"
            placeholder="备注（可选）"
            value={newNote}
            disabled={saving}
            maxLength={200}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <button type="submit" disabled={saving || !newName.trim() || newAmount === ''}>
            {saving ? '保存中...' : '确认添加'}
          </button>
        </form>
      )}

      {error ? <p className="sub-error">{error}</p> : null}

      {loading && <p className="muted sub-loading">加载中…</p>}

      {!loading && items.length === 0 && (
        <p className="muted sub-empty">还没有订阅，点击「＋ 添加」开始记录。</p>
      )}

      {!loading && items.length > 0 && (
        <ul className="sub-list">
          {items.map((item) => (
            <li key={item.id} className={`sub-item${item.active ? '' : ' sub-item-inactive'}`}>
              {editingId === item.id ? (
                <div className="sub-edit-form">
                  <input
                    className="sub-input"
                    value={editName}
                    autoFocus
                    disabled={saving}
                    maxLength={80}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <div className="sub-add-row">
                    <input
                      className="sub-input sub-amount-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editAmount}
                      disabled={saving}
                      onChange={(e) => setEditAmount(e.target.value)}
                    />
                    <select
                      className="sub-select"
                      value={editCurrency}
                      disabled={saving}
                      onChange={(e) => setEditCurrency(e.target.value)}
                    >
                      <option value="CNY">CNY</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="HKD">HKD</option>
                      <option value="JPY">JPY</option>
                    </select>
                    <select
                      className="sub-select"
                      value={editCycle}
                      disabled={saving}
                      onChange={(e) => setEditCycle(e.target.value as SubscriptionCycle)}
                    >
                      <option value="monthly">每月</option>
                      <option value="yearly">每年</option>
                    </select>
                  </div>
                  <input
                    className="sub-input sub-note-input"
                    placeholder="备注（可选）"
                    value={editNote}
                    disabled={saving}
                    maxLength={200}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                  <div className="sub-edit-btns">
                    <button type="button" disabled={saving} onClick={() => void handleSaveEdit(item)}>
                      保存
                    </button>
                    <button type="button" disabled={saving} onClick={cancelEdit}>
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sub-item-content">
                  <div className="sub-item-main">
                    <span className="sub-item-name">{item.name}</span>
                    {item.note ? <span className="sub-item-note">{item.note}</span> : null}
                  </div>
                  <div className="sub-item-right">
                    <span className="sub-item-amount">{formatAmount(item.amount, item.currency)}</span>
                    <span className={`sub-cycle-badge sub-cycle-${item.cycle}`}>
                      {item.cycle === 'monthly' ? '月' : '年'}
                    </span>
                    <div className="sub-item-actions">
                      <button
                        type="button"
                        className="sub-btn"
                        disabled={saving}
                        onClick={() => startEdit(item)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="sub-btn sub-btn-danger"
                        disabled={saving}
                        onClick={() => void handleDelete(item)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
