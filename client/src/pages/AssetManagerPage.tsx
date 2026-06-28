import { useEffect, useMemo, useState } from 'react'
import { requestWithFetch } from '../services/http'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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

type SortMode = 'manual' | 'amount-asc' | 'amount-desc'

function formatAmount(value: number) {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const TONE_LABELS: Record<AccountItem['tone'], string> = {
  blue: '蓝',
  red: '红',
  gold: '金',
  purple: '紫',
}

const PRESET_ICONS = ['◎', '★', '🏠', '🚗', '💳', '💼', '📈', '🏦']

export function AssetManagerPage({ embedded = false }: { embedded?: boolean }) {
  const [groups, setGroups] = useState<AccountGroup[]>([])
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})
  const [sortModeMap, setSortModeMap] = useState<Record<string, SortMode>>({})
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [addError, setAddError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [editingAmountId, setEditingAmountId] = useState<string | null>(null)
  const [editingAmount, setEditingAmount] = useState('')

  const [editingFullItemId, setEditingFullItemId] = useState<string | null>(null)
  const [editItemDraft, setEditItemDraft] = useState<{
    name: string
    note: string
    amount: string
    icon: string
    tone: AccountItem['tone']
  } | null>(null)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

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
    const allAmounts = groups.flatMap((g) => g.items.map((i) => i.amount))
    const totalAsset = allAmounts.filter((a) => a > 0).reduce((s, a) => s + a, 0)
    const totalDebt = Math.abs(allAmounts.filter((a) => a < 0).reduce((s, a) => s + a, 0))
    const gross = totalAsset + totalDebt
    return {
      netAsset: totalAsset - totalDebt,
      totalAsset,
      totalDebt,
      assetRatio: gross > 0 ? (totalAsset / gross) * 100 : 100,
    }
  }, [groups])

  const splitColumns = useMemo(() => {
    const assetGroups = groupSummaries
      .map((group) => {
        const items = group.items.filter((item) => item.amount >= 0)
        return { ...group, items, total: items.reduce((s, i) => s + i.amount, 0) }
      })
      .filter((group) => group.items.length > 0)

    const debtGroups = groupSummaries
      .map((group) => {
        const items = group.items.filter((item) => item.amount < 0)
        return { ...group, items, total: items.reduce((s, i) => s + i.amount, 0) }
      })
      .filter((group) => group.items.length > 0)

    return {
      assetGroups,
      debtGroups,
      assetCount: assetGroups.reduce((s, g) => s + g.items.length, 0),
      debtCount: debtGroups.reduce((s, g) => s + g.items.length, 0),
    }
  }, [groupSummaries])

  function SortableItem({
    item,
    isDraggable,
  }: {
    item: AccountItem
    isDraggable: boolean
  }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: item.id,
      disabled: !isDraggable,
    })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    const isEditingFull = editingFullItemId === item.id
    const isEditingAmt = editingAmountId === item.id
    const isDeleteConfirm = deleteConfirmId === item.id

    if (isEditingFull && editItemDraft) {
      return (
        <li ref={setNodeRef} style={style} className="am-item am-item-edit">
          <span className={`am-item-icon am-item-icon-${editItemDraft.tone}`}>
            {editItemDraft.icon || '◎'}
          </span>
          <div className="am-item-edit-form">
            <div className="am-item-edit-top">
              <input
                className="am-icon-input"
                value={editItemDraft.icon}
                placeholder="◎"
                title="图标字符"
                onChange={(e) => setEditItemDraft((p) => (p ? { ...p, icon: e.target.value } : p))}
              />
              <div className="am-tone-picker am-tone-picker-sm">
                {(['blue', 'red', 'gold', 'purple'] as const).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    className={`am-tone-btn am-tone-btn-${tone}${editItemDraft.tone === tone ? ' selected' : ''}`}
                    onClick={() => setEditItemDraft((p) => (p ? { ...p, tone } : p))}
                    title={TONE_LABELS[tone]}
                  />
                ))}
              </div>
            </div>
            <input
              className="am-field-input"
              autoFocus
              placeholder="名称"
              value={editItemDraft.name}
              onChange={(e) => setEditItemDraft((p) => (p ? { ...p, name: e.target.value } : p))}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelFullEdit()
              }}
            />
            <input
              className="am-field-input"
              placeholder="备注（可选）"
              value={editItemDraft.note}
              onChange={(e) => setEditItemDraft((p) => (p ? { ...p, note: e.target.value } : p))}
            />
            <input
              className="am-field-input"
              placeholder="金额（负债填负数）"
              value={editItemDraft.amount}
              onChange={(e) =>
                setEditItemDraft((p) => (p ? { ...p, amount: e.target.value } : p))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveFullEdit(item.id)
                }
                if (e.key === 'Escape') cancelFullEdit()
              }}
            />
            <div className="am-item-edit-btns">
              <button
                type="button"
                className="am-save-btn"
                disabled={isSaving}
                onClick={() => saveFullEdit(item.id)}
              >
                保存
              </button>
              <button type="button" className="am-cancel-btn" onClick={cancelFullEdit}>
                取消
              </button>
            </div>
          </div>
        </li>
      )
    }

    return (
      <li
        ref={setNodeRef}
        style={style}
        className={`am-item${isDeleteConfirm ? ' am-item-confirming' : ''}${isDraggable ? ' am-item-draggable' : ''}`}
      >
        {isDraggable && (
          <button
            type="button"
            className="am-drag-handle"
            {...attributes}
            {...listeners}
            title="拖拽排序"
          >
            ⋮⋮
          </button>
        )}
        <span className={`am-item-icon am-item-icon-${item.tone}`}>{item.icon}</span>
        <div className="am-item-text">
          <p>{item.name}</p>
          {item.note ? <small>{item.note}</small> : null}
        </div>
        {isDeleteConfirm ? (
          <div className="am-delete-confirm">
            <span>确认删除？</span>
            <button
              type="button"
              className="am-del-yes"
              disabled={isSaving}
              onClick={() => deleteItem(item.id)}
            >
              删除
            </button>
            <button
              type="button"
              className="am-del-no"
              onClick={() => setDeleteConfirmId(null)}
            >
              取消
            </button>
          </div>
        ) : isEditingAmt ? (
          <input
            className="am-amount-input"
            value={editingAmount}
            autoFocus
            onChange={(e) => setEditingAmount(e.target.value)}
            onBlur={() => saveAmountEdit(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                saveAmountEdit(item.id)
              }
              if (e.key === 'Escape') {
                setEditingAmountId(null)
                setEditingAmount('')
              }
            }}
          />
        ) : (
          <div className="am-item-right">
            <div className="am-item-hover-actions">
              <button
                type="button"
                className="am-item-action-btn"
                title="编辑"
                onClick={() => startFullEdit(item)}
              >
                ✎
              </button>
              <button
                type="button"
                className="am-item-action-btn am-item-action-btn-del"
                title="删除"
                onClick={() => setDeleteConfirmId(item.id)}
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              className={`am-amount-btn${item.amount < 0 ? ' am-item-amount-negative' : ''}`}
              onClick={() => startAmountEdit(item)}
              title="点击快速编辑金额"
            >
              {formatAmount(item.amount)}
            </button>
          </div>
        )}
      </li>
    )
  }

  async function loadAssets() {
    setIsLoading(true)
    setLoadError('')
    try {
      const data = await requestWithFetch<AssetsResponse>('/api/assets')
      const loadedGroups = Array.isArray(data.groups) ? data.groups : []
      setGroups(loadedGroups)
      setAddDraft((prev) => ({
        ...prev,
        groupId: loadedGroups.length > 0 ? loadedGroups[0].id : '__new__',
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd(event: DragEndEvent, groupId: string) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setGroups((currentGroups) => {
      const targetGroup = currentGroups.find((g) => g.id === groupId)
      if (!targetGroup) return currentGroups

      const oldIndex = targetGroup.items.findIndex((item) => item.id === active.id)
      const newIndex = targetGroup.items.findIndex((item) => item.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return currentGroups

      const reorderedItems = arrayMove(targetGroup.items, oldIndex, newIndex)
      const nextGroups = currentGroups.map((g) =>
        g.id === groupId ? { ...g, items: reorderedItems } : g,
      )

      void persistGroups(nextGroups)
      return nextGroups
    })

    // Switch to manual mode after drag
    setSortModeMap((prev) => ({ ...prev, [groupId]: 'manual' }))
  }

  function toggleSortMode(groupId: string) {
    setSortModeMap((prev) => {
      const current = prev[groupId] || 'manual'
      const next: SortMode = current === 'manual' ? 'amount-desc' : current === 'amount-desc' ? 'amount-asc' : 'manual'
      return { ...prev, [groupId]: next }
    })
  }

  function getSortedItems(items: AccountItem[], sortMode: SortMode): AccountItem[] {
    if (sortMode === 'amount-asc') {
      return [...items].sort((a, b) => a.amount - b.amount)
    }
    if (sortMode === 'amount-desc') {
      return [...items].sort((a, b) => b.amount - a.amount)
    }
    return items
  }

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

  function startAmountEdit(item: AccountItem) {
    setEditingAmountId(item.id)
    setEditingAmount(String(item.amount))
    setEditingFullItemId(null)
    setEditItemDraft(null)
    setDeleteConfirmId(null)
  }

  function saveAmountEdit(itemId: string) {
    const parsed = Number(editingAmount.trim())
    if (Number.isNaN(parsed)) {
      setEditingAmountId(null)
      setEditingAmount('')
      return
    }
    const nextGroups = groups.map((g) => ({
      ...g,
      items: g.items.map((i) => (i.id === itemId ? { ...i, amount: parsed } : i)),
    }))
    setGroups(nextGroups)
    setEditingAmountId(null)
    setEditingAmount('')
    void persistGroups(nextGroups)
  }

  function startFullEdit(item: AccountItem) {
    setEditingFullItemId(item.id)
    setEditItemDraft({
      name: item.name,
      note: item.note || '',
      amount: String(item.amount),
      icon: item.icon,
      tone: item.tone,
    })
    setEditingAmountId(null)
    setEditingAmount('')
    setDeleteConfirmId(null)
  }

  function saveFullEdit(itemId: string) {
    if (!editItemDraft) return
    const name = editItemDraft.name.trim()
    if (!name) return
    const amount = Number(editItemDraft.amount.trim())
    if (Number.isNaN(amount)) return
    const nextGroups = groups.map((g) => ({
      ...g,
      items: g.items.map((i) =>
        i.id === itemId
          ? {
              ...i,
              name,
              note: editItemDraft.note.trim() || undefined,
              amount,
              icon: editItemDraft.icon.trim() || '◎',
              tone: editItemDraft.tone,
            }
          : i,
      ),
    }))
    setGroups(nextGroups)
    setEditingFullItemId(null)
    setEditItemDraft(null)
    void persistGroups(nextGroups)
  }

  function cancelFullEdit() {
    setEditingFullItemId(null)
    setEditItemDraft(null)
  }

  function deleteItem(itemId: string) {
    const nextGroups = groups.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.id !== itemId),
    }))
    setGroups(nextGroups)
    setDeleteConfirmId(null)
    void persistGroups(nextGroups)
  }

  function addAsset() {
    const name = addDraft.name.trim()
    const amount = Number(addDraft.amount.trim())
    if (!name) return setAddError('资产名称必填')
    if (Number.isNaN(amount)) return setAddError('金额格式不正确')

    const isNew =
      addDraft.groupId === '__new__' || !groupSummaries.some((g) => g.id === addDraft.groupId)
    const newGroupTitle = addDraft.groupTitle.trim()
    if (isNew && !newGroupTitle) return setAddError('请填写新分组名称')

    const newAsset: AccountItem = {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      note: addDraft.note.trim() || undefined,
      amount,
      icon: addDraft.icon.trim() || '◎',
      tone: addDraft.tone,
    }

    let targetGroupId = addDraft.groupId
    let nextGroups: AccountGroup[]

    if (isNew) {
      const newGroupId =
        newGroupTitle
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9\-\u4e00-\u9fa5]/g, '') || `group-${Date.now()}`
      targetGroupId = newGroupId
      nextGroups = [...groups, { id: newGroupId, title: newGroupTitle, items: [newAsset] }]
    } else {
      nextGroups = groups.map((g) =>
        g.id === targetGroupId ? { ...g, items: [...g.items, newAsset] } : g,
      )
    }

    setGroups(nextGroups)
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

  function renderGroupSection(
    group: { id: string; title: string; count: number; items: AccountItem[]; total: number },
    keyPrefix: string,
  ) {
    const sortMode = sortModeMap[group.id] || 'manual'
    const sortedItems = getSortedItems(group.items, sortMode)
    const isDraggable = sortMode === 'manual'

    const sortIcon =
      sortMode === 'amount-desc' ? '↓' : sortMode === 'amount-asc' ? '↑' : '⋮⋮'
    const sortTitle =
      sortMode === 'amount-desc'
        ? '当前: 金额降序'
        : sortMode === 'amount-asc'
          ? '当前: 金额升序'
          : '当前: 手动排序'

    return (
      <section key={`${keyPrefix}-${group.id}`} className="am-group">
        <header className="am-group-header">
          <button
            type="button"
            className="am-group-title"
            onClick={() => toggleGroup(group.id)}
          >
            <span className="am-group-chevron">
              {collapsedMap[group.id] ? '▶' : '▼'}
            </span>
            <span className="am-group-name">{group.title}</span>
            <small className="am-group-count">{group.items.length}</small>
          </button>
          <div className="am-group-header-right">
            <button
              type="button"
              className="am-sort-btn"
              onClick={() => toggleSortMode(group.id)}
              title={sortTitle}
            >
              {sortIcon}
            </button>
            <span className="am-group-total">{formatAmount(group.total)}</span>
          </div>
        </header>
        {!collapsedMap[group.id] && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => handleDragEnd(event, group.id)}
          >
            <SortableContext items={sortedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="am-items">
                {sortedItems.map((item) => (
                  <SortableItem key={item.id} item={item} isDraggable={isDraggable} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>
    )
  }

  const isCreatingNewGroup =
    addDraft.groupId === '__new__' || groupSummaries.length === 0

  return (
    <section className="page-shell am-page">
      <header className={embedded ? 'am-header am-header-embedded' : 'am-header page-hero page-hero-inline'}>
        {!embedded && <h2>资产管家</h2>}
        <div className="am-header-actions">
          <button
            type="button"
            className={`am-icon-btn${isAddFormOpen ? ' am-icon-btn-active' : ''}`}
            disabled={isSaving}
            onClick={() => {
              setIsAddFormOpen((prev) => !prev)
              setAddError('')
            }}
          >
            {isAddFormOpen ? '收起' : '＋ 添加'}
          </button>
          <button
            type="button"
            className="am-icon-btn"
            disabled={isSaving || isLoading}
            onClick={() => void loadAssets()}
          >
            {isLoading ? '加载中…' : '刷新'}
          </button>
        </div>
      </header>

      <article className="am-summary-card">
        <div className="am-summary-body">
          <div className="am-summary-main-block">
            <p className="am-summary-label">净资产</p>
            <p className={`am-summary-main${totals.netAsset < 0 ? ' am-summary-main-neg' : ''}`}>
              ¥ {formatAmount(Math.abs(totals.netAsset))}
            </p>
          </div>
          <div className="am-summary-stats">
            <div className="am-summary-stat">
              <span className="am-summary-stat-label">总资产</span>
              <span className="am-summary-stat-value am-stat-asset">
                ¥ {formatAmount(totals.totalAsset)}
              </span>
            </div>
            <div className="am-summary-stat">
              <span className="am-summary-stat-label">总负债</span>
              <span className="am-summary-stat-value am-stat-debt">
                ¥ {formatAmount(totals.totalDebt)}
              </span>
            </div>
          </div>
        </div>
        {totals.totalAsset + totals.totalDebt > 0 && (
          <div className="am-summary-bar-track">
            <div
              className="am-summary-bar-fill"
              style={{ width: `${totals.assetRatio}%` }}
            />
          </div>
        )}
      </article>

      {(loadError || saveError) && (
        <p className="am-error am-page-error">
          {loadError ? `加载失败：${loadError}` : `保存失败：${saveError}`}
        </p>
      )}
      {isSaving && <p className="am-tools-tip">保存中…</p>}

      {isAddFormOpen && (
        <section className="am-add-panel">
          <h4 className="am-add-panel-title">添加资产</h4>
          <div className="am-add-form-grid">
            <div className="am-form-group">
              <label className="am-form-label">分组</label>
              <select
                className="am-select"
                value={isCreatingNewGroup && groupSummaries.length > 0 ? '__new__' : addDraft.groupId}
                onChange={(e) => {
                  const val = e.target.value
                  setAddDraft((prev) => ({
                    ...prev,
                    groupId: val,
                    groupTitle: val === '__new__' ? prev.groupTitle : '',
                  }))
                }}
              >
                {groupSummaries.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
                <option value="__new__">＋ 新建分组</option>
              </select>
            </div>
            {isCreatingNewGroup && (
              <div className="am-form-group">
                <label className="am-form-label">分组名称 *</label>
                <input
                  className="am-search-input"
                  placeholder="请输入新分组名称"
                  value={addDraft.groupTitle}
                  onChange={(e) =>
                    setAddDraft((prev) => ({ ...prev, groupTitle: e.target.value }))
                  }
                />
              </div>
            )}
            <div className="am-form-group">
              <label className="am-form-label">名称 *</label>
              <input
                className="am-search-input"
                placeholder="资产名称"
                value={addDraft.name}
                onChange={(e) => setAddDraft((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="am-form-group">
              <label className="am-form-label">备注</label>
              <input
                className="am-search-input"
                placeholder="可选"
                value={addDraft.note}
                onChange={(e) => setAddDraft((prev) => ({ ...prev, note: e.target.value }))}
              />
            </div>
            <div className="am-form-group">
              <label className="am-form-label">金额 *</label>
              <input
                className="am-search-input"
                placeholder="负债填负数，如 -50000"
                value={addDraft.amount}
                onChange={(e) => setAddDraft((prev) => ({ ...prev, amount: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addAsset()
                  }
                }}
              />
            </div>
            <div className="am-form-group">
              <label className="am-form-label">图标</label>
              <div className="am-icon-picker-row">
                {PRESET_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={`am-icon-preset-btn${addDraft.icon === icon ? ' selected' : ''}`}
                    onClick={() => setAddDraft((prev) => ({ ...prev, icon }))}
                  >
                    {icon}
                  </button>
                ))}
                <input
                  className="am-icon-input"
                  placeholder="自定义"
                  value={addDraft.icon}
                  onChange={(e) => setAddDraft((prev) => ({ ...prev, icon: e.target.value }))}
                />
              </div>
            </div>
            <div className="am-form-group">
              <label className="am-form-label">颜色</label>
              <div className="am-tone-picker">
                {(['blue', 'red', 'gold', 'purple'] as const).map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    className={`am-tone-btn am-tone-btn-${tone}${addDraft.tone === tone ? ' selected' : ''}`}
                    onClick={() => setAddDraft((prev) => ({ ...prev, tone }))}
                    title={TONE_LABELS[tone]}
                  >
                    {TONE_LABELS[tone]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="am-add-actions">
            {addError && <p className="am-error">{addError}</p>}
            <div className="am-add-btns">
              <button
                type="button"
                className="am-cancel-btn"
                onClick={() => {
                  setIsAddFormOpen(false)
                  setAddError('')
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="am-add-submit"
                disabled={isSaving}
                onClick={addAsset}
              >
                确认添加
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="am-columns">
        <section className="am-column">
          <header className="am-column-header">
            <h3>资产</h3>
            <span>{splitColumns.assetCount} 条</span>
          </header>
          <div className="am-list">
            {splitColumns.assetGroups.length ? (
              splitColumns.assetGroups.map((g) => renderGroupSection(g, 'asset'))
            ) : (
              <p className="am-empty">暂无资产项。</p>
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
              splitColumns.debtGroups.map((g) => renderGroupSection(g, 'debt'))
            ) : (
              <p className="am-empty">暂无负债项。</p>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
