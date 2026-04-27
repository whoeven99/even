import { useEffect, useMemo, useState } from 'react'
import { requestWithFetch } from '../services/http'

type AccountItem = {
  id: string
  name: string
  note?: string
  amount: number
  icon: string
  tone: 'red' | 'gold' | 'blue' | 'purple'
}

type AccountGroup = {
  id: string
  title: string
  items: AccountItem[]
}

type AssetsResponse = {
  ok: boolean
  groups: AccountGroup[]
  updatedAt: string | null
}

function formatAmount(value: number) {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function AssetManagerPage() {
  const [groups, setGroups] = useState<AccountGroup[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('all')
  const [hideZeroAmount, setHideZeroAmount] = useState(false)
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [addError, setAddError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingAmount, setEditingAmount] = useState('')
  const [addDraft, setAddDraft] = useState({
    groupId: '',
    groupTitle: '',
    name: '',
    note: '',
    amount: '',
    icon: '◎',
    tone: 'blue' as AccountItem['tone'],
  })

  const groupSummaries = useMemo(
    () =>
      groups.map((group) => ({
        id: group.id,
        title: group.title,
        count: group.items.length,
        total: group.items.reduce((sum, item) => sum + item.amount, 0),
        items: group.items,
      })),
    [groups],
  )

  const totals = useMemo(() => {
    const allAmounts = groups.flatMap((group) => group.items.map((item) => item.amount))
    const totalAsset = allAmounts.filter((amount) => amount > 0).reduce((sum, amount) => sum + amount, 0)
    const totalDebt = Math.abs(
      allAmounts.filter((amount) => amount < 0).reduce((sum, amount) => sum + amount, 0),
    )
    return {
      netAsset: totalAsset - totalDebt,
      totalAsset,
      totalDebt,
    }
  }, [groups])

  const filteredGroups = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()

    return groupSummaries
      .filter((group) => selectedGroupId === 'all' || group.id === selectedGroupId)
      .map((group) => {
        const items = group.items.filter((item) => {
          if (hideZeroAmount && item.amount === 0) return false
          if (!normalizedKeyword) return true
          return `${item.name} ${item.note || ''}`.toLowerCase().includes(normalizedKeyword)
        })
        return {
          ...group,
          items,
          total: items.reduce((sum, item) => sum + item.amount, 0),
        }
      })
      .filter((group) => group.items.length > 0)
  }, [groupSummaries, hideZeroAmount, keyword, selectedGroupId])

  const splitColumns = useMemo(() => {
    const assetGroups = filteredGroups
      .map((group) => {
        const items = group.items.filter((item) => item.amount >= 0)
        return {
          ...group,
          items,
          total: items.reduce((sum, item) => sum + item.amount, 0),
        }
      })
      .filter((group) => group.items.length > 0)

    const debtGroups = filteredGroups
      .map((group) => {
        const items = group.items.filter((item) => item.amount < 0)
        return {
          ...group,
          items,
          total: items.reduce((sum, item) => sum + item.amount, 0),
        }
      })
      .filter((group) => group.items.length > 0)

    return {
      assetGroups,
      debtGroups,
      assetCount: assetGroups.reduce((sum, group) => sum + group.items.length, 0),
      debtCount: debtGroups.reduce((sum, group) => sum + group.items.length, 0),
    }
  }, [filteredGroups])

  const visibleItemCount = filteredGroups.reduce((sum, group) => sum + group.items.length, 0)
  const totalItemCount = groupSummaries.reduce((sum, group) => sum + group.count, 0)

  async function loadAssets() {
    setIsLoading(true)
    setLoadError('')
    try {
      const data = await requestWithFetch<AssetsResponse>('/api/assets')
      const loadedGroups = Array.isArray(data.groups) ? data.groups : []
      setGroups(loadedGroups)
      setAddDraft((prev) => ({
        ...prev,
        groupId: loadedGroups[0]?.id || '',
      }))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadAssets()
  }, [])

  async function persistGroups(nextGroups: AccountGroup[]) {
    setIsSaving(true)
    setSaveError('')
    try {
      const data = await requestWithFetch<AssetsResponse>('/api/assets', {
        method: 'PUT',
        body: JSON.stringify({ groups: nextGroups }),
      })
      setGroups(Array.isArray(data.groups) ? data.groups : nextGroups)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  function toggleGroup(id: string) {
    setCollapsedMap((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function resetFilters() {
    setKeyword('')
    setSelectedGroupId('all')
    setHideZeroAmount(false)
  }

  function updateItemAmount(itemId: string, amount: number) {
    const nextGroups = groups.map((group) => ({
      ...group,
      items: group.items.map((item) => (item.id === itemId ? { ...item, amount } : item)),
    }))
    setGroups(nextGroups)
    void persistGroups(nextGroups)
  }

  function ensureSelectedGroup() {
    if (groupSummaries.length && !addDraft.groupId) {
      setAddDraft((prev) => ({ ...prev, groupId: groupSummaries[0].id }))
    }
  }

  useEffect(() => {
    ensureSelectedGroup()
  }, [groupSummaries.length, addDraft.groupId])

  function createGroupIdFromTitle(title: string) {
    const compact = title.trim().toLowerCase().replace(/\s+/g, '-')
    const safe = compact.replace(/[^a-z0-9-\u4e00-\u9fa5]/g, '')
    return safe || `group-${Date.now()}`
  }

  function addAsset() {
    const name = addDraft.name.trim()
    const amount = Number(addDraft.amount.trim())
    if (!name) return setAddError('资产名称必填')
    if (Number.isNaN(amount)) return setAddError('金额格式不正确')

    let targetGroupId = addDraft.groupId
    const hasGroup = groupSummaries.some((group) => group.id === targetGroupId)
    const shouldCreateGroup = !hasGroup
    const newGroupTitle = addDraft.groupTitle.trim()
    if (shouldCreateGroup && !newGroupTitle) {
      return setAddError('当前没有分组，请先填写分组名称')
    }

    const newAsset: AccountItem = {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      note: addDraft.note.trim() || undefined,
      amount,
      icon: addDraft.icon.trim() || '◎',
      tone: addDraft.tone,
    }

    let nextGroups: AccountGroup[] = []
    if (shouldCreateGroup) {
      const newGroupId = createGroupIdFromTitle(newGroupTitle)
      targetGroupId = newGroupId
      nextGroups = [
        ...groups,
        {
          id: newGroupId,
          title: newGroupTitle,
          items: [newAsset],
        },
      ]
    } else {
      nextGroups = groups.map((group) =>
        group.id === targetGroupId ? { ...group, items: [...group.items, newAsset] } : group,
      )
    }
    setGroups(nextGroups)
    setSelectedGroupId(targetGroupId || 'all')
    setAddError('')
    setIsAddFormOpen(false)
    setAddDraft((prev) => ({
      ...prev,
      groupId: targetGroupId,
      groupTitle: '',
      name: '',
      note: '',
      amount: '',
    }))
    void persistGroups(nextGroups)
  }

  function startAmountEdit(item: AccountItem) {
    setEditingItemId(item.id)
    setEditingAmount(String(item.amount))
  }

  function saveAmountEdit(itemId: string) {
    const parsed = Number(editingAmount.trim())
    if (Number.isNaN(parsed)) return
    updateItemAmount(itemId, parsed)
    setEditingItemId(null)
    setEditingAmount('')
  }

  return (
    <section className="page-shell am-page">
      <header className="am-header page-hero page-hero-inline">
        <h2>资产管家</h2>
        <div className="am-header-actions">
          <button
            type="button"
            className="am-icon-btn"
            aria-label="添加资产"
            onClick={() => {
              setIsAddFormOpen((prev) => !prev)
              setAddError('')
            }}
          >
            添加资产
          </button>
          <button type="button" className="am-icon-btn" aria-label="重置筛选" onClick={resetFilters}>
            重置
          </button>
          <button type="button" className="am-icon-btn" aria-label="刷新资产" onClick={() => void loadAssets()}>
            刷新
          </button>
        </div>
      </header>

      <article className="am-summary-card">
        <p className="am-summary-label">净资产</p>
        <p className="am-summary-main">{formatAmount(totals.netAsset)}</p>
        <div className="am-summary-sub">
          <span>资产 {formatAmount(totals.totalAsset)}</span>
          <span>负债 {formatAmount(totals.totalDebt)}</span>
        </div>
      </article>

      <section className="am-tools">
        {isAddFormOpen ? (
          <div className="am-add-form">
            <select
              className="am-select"
              value={addDraft.groupId}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, groupId: event.target.value }))}
            >
              {groupSummaries.length ? (
                groupSummaries.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.title}
                  </option>
                ))
              ) : (
                <option value="">无分组（将创建新分组）</option>
              )}
            </select>
            {!groupSummaries.length ? (
              <input
                className="am-search-input"
                placeholder="新分组名称"
                value={addDraft.groupTitle}
                onChange={(event) =>
                  setAddDraft((prev) => ({ ...prev, groupTitle: event.target.value, groupId: '' }))
                }
              />
            ) : null}
            <input
              className="am-search-input"
              placeholder="资产名称"
              value={addDraft.name}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              className="am-search-input"
              placeholder="备注（可选）"
              value={addDraft.note}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, note: event.target.value }))}
            />
            <input
              className="am-search-input"
              placeholder="金额（负债填负数）"
              value={addDraft.amount}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, amount: event.target.value }))}
            />
            <input
              className="am-search-input"
              placeholder="图标字符（可选）"
              value={addDraft.icon}
              onChange={(event) => setAddDraft((prev) => ({ ...prev, icon: event.target.value }))}
            />
            <select
              className="am-select"
              value={addDraft.tone}
              onChange={(event) =>
                setAddDraft((prev) => ({
                  ...prev,
                  tone: event.target.value as AccountItem['tone'],
                }))
              }
            >
              <option value="blue">蓝色</option>
              <option value="red">红色</option>
              <option value="gold">金色</option>
              <option value="purple">紫色</option>
            </select>
            <button type="button" className="am-add-submit" onClick={addAsset}>
              确认添加
            </button>
            {addError ? <p className="am-error">{addError}</p> : null}
          </div>
        ) : null}
        {isLoading ? <p className="am-tools-tip">资产加载中...</p> : null}
        {isSaving ? <p className="am-tools-tip">保存中...</p> : null}
        {loadError ? <p className="am-error">资产加载失败：{loadError}</p> : null}
        {saveError ? <p className="am-error">资产保存失败：{saveError}</p> : null}

        <input
          className="am-search-input"
          placeholder="搜索账户名称或备注"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <select
          className="am-select"
          value={selectedGroupId}
          onChange={(event) => setSelectedGroupId(event.target.value)}
        >
          <option value="all">全部分组</option>
          {groupSummaries.map((group) => (
            <option key={group.id} value={group.id}>
              {group.title}
            </option>
          ))}
        </select>
        <label className="am-checkbox">
          <input
            type="checkbox"
            checked={hideZeroAmount}
            onChange={(event) => setHideZeroAmount(event.target.checked)}
          />
          <span>隐藏金额为 0</span>
        </label>
        <p className="am-tools-tip">
          当前显示 {visibleItemCount}/{totalItemCount} 条账户
        </p>
      </section>

      <div className="am-columns">
        <section className="am-column">
          <header className="am-column-header">
            <h3>资产</h3>
            <span>{splitColumns.assetCount} 条</span>
          </header>
          <div className="am-list">
            {splitColumns.assetGroups.length ? (
              splitColumns.assetGroups.map((group) => (
                <section key={`asset-${group.id}`} className="am-group">
                  <header className="am-group-header">
                    <button type="button" className="am-group-title" onClick={() => toggleGroup(group.id)}>
                      <h3>{group.title}</h3>
                      <small>{collapsedMap[group.id] ? '展开' : '收起'}</small>
                    </button>
                    <span>{formatAmount(group.total)}</span>
                  </header>

                  {!collapsedMap[group.id] ? (
                    <ul className="am-items">
                      {group.items.map((item) => (
                        <li key={item.id} className="am-item">
                          <span className={`am-item-icon am-item-icon-${item.tone}`}>{item.icon}</span>
                          <div className="am-item-text">
                            <p>{item.name}</p>
                            {item.note ? <small>{item.note}</small> : null}
                          </div>
                          {editingItemId === item.id ? (
                            <input
                              className="am-amount-input"
                              value={editingAmount}
                              autoFocus
                              onChange={(event) => setEditingAmount(event.target.value)}
                              onBlur={() => saveAmountEdit(item.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  saveAmountEdit(item.id)
                                }
                                if (event.key === 'Escape') {
                                  setEditingItemId(null)
                                  setEditingAmount('')
                                }
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className={`am-amount-btn ${item.amount < 0 ? 'am-item-amount-negative' : ''}`}
                              onClick={() => startAmountEdit(item)}
                              title="点击编辑金额"
                            >
                              {formatAmount(item.amount)}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))
            ) : (
              <p className="am-empty">当前筛选条件下暂无资产项。</p>
            )}
          </div>
        </section>

        <section className="am-column">
          <header className="am-column-header">
            <h3>负债</h3>
            <span>{splitColumns.debtCount} 条</span>
          </header>
          <div className="am-list">
            {splitColumns.debtGroups.length ? (
              splitColumns.debtGroups.map((group) => (
                <section key={`debt-${group.id}`} className="am-group">
                  <header className="am-group-header">
                    <button type="button" className="am-group-title" onClick={() => toggleGroup(group.id)}>
                      <h3>{group.title}</h3>
                      <small>{collapsedMap[group.id] ? '展开' : '收起'}</small>
                    </button>
                    <span>{formatAmount(group.total)}</span>
                  </header>

                  {!collapsedMap[group.id] ? (
                    <ul className="am-items">
                      {group.items.map((item) => (
                        <li key={item.id} className="am-item">
                          <span className={`am-item-icon am-item-icon-${item.tone}`}>{item.icon}</span>
                          <div className="am-item-text">
                            <p>{item.name}</p>
                            {item.note ? <small>{item.note}</small> : null}
                          </div>
                          {editingItemId === item.id ? (
                            <input
                              className="am-amount-input"
                              value={editingAmount}
                              autoFocus
                              onChange={(event) => setEditingAmount(event.target.value)}
                              onBlur={() => saveAmountEdit(item.id)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  saveAmountEdit(item.id)
                                }
                                if (event.key === 'Escape') {
                                  setEditingItemId(null)
                                  setEditingAmount('')
                                }
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className={`am-amount-btn ${item.amount < 0 ? 'am-item-amount-negative' : ''}`}
                              onClick={() => startAmountEdit(item)}
                              title="点击编辑金额"
                            >
                              {formatAmount(item.amount)}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))
            ) : (
              <p className="am-empty">当前筛选条件下暂无负债项。</p>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
