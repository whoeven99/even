import { useMemo, useState } from 'react'

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

const initialGroups: AccountGroup[] = [
  {
    id: 'bank-card',
    title: '储蓄卡',
    items: [
      { id: 'boc', name: '中国银行', note: '13760 + 3000 港币', amount: 18000, icon: '◎', tone: 'red' },
      { id: 'cmb', name: '招商银行', amount: 24000, icon: 'M', tone: 'red' },
      { id: 'cmbc', name: '民生银行', note: '房贷卡', amount: 2000, icon: '▬', tone: 'gold' },
      { id: 'szbank', name: '苏州银行', note: '社保卡', amount: 160240, icon: '▬', tone: 'gold' },
    ],
  },
  {
    id: 'virtual',
    title: '虚拟账户',
    items: [
      { id: 'alipay-gold', name: '支付宝', note: '黄金', amount: 25403, icon: '支', tone: 'blue' },
      { id: 'alipay-yeb', name: '支付宝', note: '余额宝', amount: 3481, icon: '支', tone: 'blue' },
    ],
  },
  {
    id: 'invest',
    title: '投资账户',
    items: [
      { id: 'stock-a', name: '股票', note: 'A 股 9w', amount: 82484, icon: '◍', tone: 'gold' },
      { id: 'stock-hkd', name: '股票', note: '港币 25w，显示人民币', amount: 250000, icon: '◍', tone: 'gold' },
    ],
  },
  {
    id: 'debt',
    title: '负债',
    items: [
      { id: 'debt-baiyao', name: '柏药', amount: -400000, icon: '▭', tone: 'red' },
      { id: 'debt-zonghang', name: '宗航', amount: -10000, icon: '▭', tone: 'red' },
      { id: 'debt-cmb', name: '招商闪电贷', amount: -400000, icon: '▭', tone: 'red' },
      { id: 'debt-minsheng', name: '民生', note: '26-4-9 之前', amount: -200000, icon: '▭', tone: 'red' },
      { id: 'debt-business', name: '商业贷', note: '8333.88', amount: 0, icon: '▭', tone: 'red' },
      { id: 'debt-gjj', name: '公积金贷', note: '5318.16', amount: 0, icon: '▭', tone: 'red' },
      { id: 'debt-car', name: '零跑车', note: '120000', amount: -108000, icon: '▭', tone: 'red' },
      { id: 'debt-chengjia', name: '成佳', amount: -100000, icon: '▭', tone: 'red' },
    ],
  },
  {
    id: 'credit-rights',
    title: '债权',
    items: [
      { id: 'right-hzjd', name: '杭州建德', amount: 150000, icon: '◔', tone: 'blue' },
      { id: 'right-loan', name: '借出', amount: 200000, icon: '◔', tone: 'blue' },
      { id: 'right-szhouse', name: '苏州房子', note: '350w - 300w', amount: 0, icon: '◔', tone: 'blue' },
      { id: 'right-zhujie', name: '竹巷街', note: '房子年底卖 40w', amount: 400000, icon: '◔', tone: 'blue' },
    ],
  },
  {
    id: 'custom-assets',
    title: '自定义资产',
    items: [
      { id: 'custom-hz', name: '杭州', note: '9000', amount: 0, icon: '◉', tone: 'purple' },
      { id: 'custom-gold', name: '黄金实物', note: '成本 7580', amount: 9700, icon: '◉', tone: 'purple' },
      { id: 'custom-silver', name: '白银实物', note: '成本 500', amount: 500, icon: '◉', tone: 'purple' },
    ],
  },
]

function formatAmount(value: number) {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function AssetManagerPage() {
  const [groups, setGroups] = useState<AccountGroup[]>(initialGroups)
  const [keyword, setKeyword] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('all')
  const [hideZeroAmount, setHideZeroAmount] = useState(false)
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [addError, setAddError] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingAmount, setEditingAmount] = useState('')
  const [addDraft, setAddDraft] = useState({
    groupId: initialGroups[0]?.id || '',
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

  const visibleItemCount = filteredGroups.reduce((sum, group) => sum + group.items.length, 0)
  const totalItemCount = groupSummaries.reduce((sum, group) => sum + group.count, 0)

  function toggleGroup(id: string) {
    setCollapsedMap((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function resetFilters() {
    setKeyword('')
    setSelectedGroupId('all')
    setHideZeroAmount(false)
  }

  function updateItemAmount(itemId: string, amount: number) {
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        items: group.items.map((item) => (item.id === itemId ? { ...item, amount } : item)),
      })),
    )
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

  function addAsset() {
    const name = addDraft.name.trim()
    const amount = Number(addDraft.amount.trim())
    if (!name) return setAddError('资产名称必填')
    if (Number.isNaN(amount)) return setAddError('金额格式不正确')
    if (!addDraft.groupId) return setAddError('请选择分组')

    const newAsset: AccountItem = {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      note: addDraft.note.trim() || undefined,
      amount,
      icon: addDraft.icon.trim() || '◎',
      tone: addDraft.tone,
    }

    setGroups((prev) =>
      prev.map((group) =>
        group.id === addDraft.groupId ? { ...group, items: [...group.items, newAsset] } : group,
      ),
    )
    setSelectedGroupId(addDraft.groupId)
    setAddError('')
    setIsAddFormOpen(false)
    setAddDraft((prev) => ({ ...prev, name: '', note: '', amount: '' }))
  }

  return (
    <section className="am-page">
      <header className="am-header">
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
              {groupSummaries.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.title}
                </option>
              ))}
            </select>
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

      <div className="am-list">
        {filteredGroups.length ? (
          filteredGroups.map((group) => (
            <section key={group.id} className="am-group">
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
          <p className="am-empty">没有匹配的账户，请调整筛选条件。</p>
        )}
      </div>
    </section>
  )
}
