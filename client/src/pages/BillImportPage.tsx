import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { useEffect } from 'react'
import {
  readCachedBillStages,
  writeCachedBillStages,
} from '../utils/billStageCache'

type BillTransaction = {
  time: string
  type: string
  counterparty: string
  product: string
  direction: string
  amount: number
  category: string
  payment: string
  status: string
}

type BillImportResponse = {
  ok: boolean
  message?: string
  stageId?: string
  stageInfo?: {
    stageId: string
    monthKey?: string
    stageCount?: number
    rowCount: number
    invalidAiLines: number
    chunkCount: number
    sourceLineCount: number
    expiresInMs: number
    storageMode: string
    createdStages?: Array<{
      stageId: string
      monthKey?: string
      rowCount: number
    }>
  }
  categories?: string[]
  transactions?: BillTransaction[]
  summaryByCategory?: Record<string, number>
  meta?: {
    expenseTotal: number
    incomeTotal: number
    expenseCount: number
    transactionCount: number
    skippedRows: number
    monthHint: string
    parseMode?: string
  }
}

type BillStageListItem = {
  stageId: string
  createdAt: number
  storageMode: string
  rowCount: number
  sourceLineCount: number
}

function getStageMonthSortValue(stage: BillStageListItem): number {
  const fromStageId = stage.stageId.match(/(20\d{2})[-_/]?([01]\d)/)
  if (fromStageId) {
    return Number(`${fromStageId[1]}${fromStageId[2]}`)
  }
  if (Number.isFinite(stage.createdAt)) {
    const date = new Date(stage.createdAt)
    if (!Number.isNaN(date.getTime())) {
      return date.getFullYear() * 100 + (date.getMonth() + 1)
    }
  }
  return 0
}

function sortStagesByMonthDesc(stages: BillStageListItem[]): BillStageListItem[] {
  return [...stages].sort((a, b) => {
    const monthDiff = getStageMonthSortValue(b) - getStageMonthSortValue(a)
    if (monthDiff !== 0) return monthDiff
    return Number(b.createdAt || 0) - Number(a.createdAt || 0)
  })
}

function formatStageMonth(stage: BillStageListItem): string {
  const fromStageId = stage.stageId.match(/(20\d{2})[-_/]?([01]\d)/)
  if (fromStageId) {
    return `${fromStageId[1]}-${fromStageId[2]}`
  }

  if (Number.isFinite(stage.createdAt)) {
    const date = new Date(stage.createdAt)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    if (!Number.isNaN(year)) {
      return `${year}-${month}`
    }
  }

  return '未知月份'
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  const raw = await response.text()
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function BillImportPage() {
  const cachedStages = sortStagesByMonthDesc(readCachedBillStages<BillStageListItem>())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<BillImportResponse | null>(null)
  const [stages, setStages] = useState<BillStageListItem[]>(cachedStages)
  const [selectedStageId, setSelectedStageId] = useState(
    cachedStages[0]?.stageId ?? '',
  )
  const [stageLoading, setStageLoading] = useState(false)
  const [detailCategory, setDetailCategory] = useState<string | null>('其他')

  async function refreshStages(silent = false) {
    try {
      const response = await fetch('/api/bills/stages?limit=30')
      const json = (await parseJsonSafe<{
        ok: boolean
        message?: string
        stages?: BillStageListItem[]
      }>(response)) ?? { ok: false, message: `HTTP ${response.status}` }
      if (!response.ok || !json.ok) {
        throw new Error(json.message || `历史暂存接口异常（HTTP ${response.status}）`)
      }
      const items = sortStagesByMonthDesc(json.stages ?? [])
      setStages(items)
      writeCachedBillStages(items)
      if (items.length > 0 && !selectedStageId) {
        setSelectedStageId(items[0].stageId)
      }
    } catch (e) {
      if (!silent) {
        setError((e as Error).message)
      }
    }
  }

  async function handleLoadStage(stageId = selectedStageId) {
    if (!stageId || stageLoading) return
    setError(null)
    setStageLoading(true)
    try {
      const response = await fetch('/api/bills/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      })
      const json =
        (await parseJsonSafe<BillImportResponse>(response)) ??
        ({ ok: false, message: `HTTP ${response.status}` } as BillImportResponse)
      if (!response.ok || !json.ok) {
        throw new Error(json.message || `HTTP ${response.status}`)
      }
      setData(json)
      if (json.stageInfo?.stageId) {
        setSelectedStageId(json.stageInfo.stageId)
      }
      await refreshStages(true)
      setDetailCategory('其他')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStageLoading(false)
    }
  }

  async function handleStageChange(event: ChangeEvent<HTMLSelectElement>) {
    const stageId = event.target.value
    setSelectedStageId(stageId)
    await handleLoadStage(stageId)
  }

  useEffect(() => {
    refreshStages(true)
  }, [])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError(null)
    setData(null)
    setLoading(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/bills/import', {
        method: 'POST',
        body: formData,
      })
      const json =
        (await parseJsonSafe<BillImportResponse>(response)) ??
        ({ ok: false, message: `HTTP ${response.status}` } as BillImportResponse)
      if (!response.ok || !json.ok) {
        throw new Error(json.message || `HTTP ${response.status}`)
      }
      setData(json)
      setDetailCategory('其他')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const topCategoryTransactions =
    data?.transactions && detailCategory
      ? data.transactions
          .filter(
            (t) => t.direction === '支出' && t.category === detailCategory,
          )
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10)
      : []

  const totalAmount = data?.meta
    ? data.meta.expenseTotal + data.meta.incomeTotal
    : 0

  return (
    <section className="bill-page">
      <header className="bill-hero">
        <div>
          <h2>微信账单导入</h2>
          <p className="muted">
            支持微信「账单源文件」导出（CSV 或 Excel）。上传后由服务端使用与 AI
            对话相同的 DeepSeek 配置解析内容、抽取流水并归类。
          </p>
        </div>
        <div className="bill-hero-tip">
          <span>支持多月账单，上传后会自动按月份拆分暂存</span>
        </div>
      </header>

      <div className="bill-control-grid">
        <article className="bill-panel">
          <h3>上传新账单</h3>
          <p className="muted">支持 .csv / .xls / .xlsx，上传后自动解析并展示统计结果。</p>
          <div className="bill-upload">
            <label className="bill-upload-label">
              {loading ? 'AI 解析中…' : '选择账单文件'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={loading}
                onChange={handleFileChange}
              />
            </label>
          </div>
        </article>

        <article className="bill-panel">
          <h3>历史账单</h3>
          <div className="bill-stage-picker">
            <select
              id="stage-select"
              aria-label="选择历史账单"
              value={selectedStageId}
              onChange={handleStageChange}
              disabled={stageLoading || stages.length === 0}
            >
              {stages.length === 0 && <option value="">暂无暂存</option>}
              {stages.map((stage) => (
                <option key={stage.stageId} value={stage.stageId}>
                  {formatStageMonth(stage)}
                </option>
              ))}
            </select>
            {stageLoading && (
              <span className="bill-stage-loading" role="status" aria-live="polite">
                查询中...
              </span>
            )}
          </div>
        </article>
      </div>

      {error && <p className="bill-error">{error}</p>}
      {data?.stageInfo?.stageCount && data.stageInfo.stageCount > 1 && (
        <p className="bill-batch-hint">
          本次上传已按月份拆分并暂存 {data.stageInfo.stageCount} 份账单，可在「历史账单」中切换查看。
        </p>
      )}

      {data?.meta && (
        <section className="bill-panel">
          <div className="bill-section-header">
            <h3>账单总览</h3>
            {data?.meta?.parseMode === 'ai' && (
              <span className="bill-parse-hint">
                解析方式：DeepSeek（与「AI 对话」相同环境）
              </span>
            )}
          </div>
          <div className="bill-summary-cards">
            <div className="bill-stat">
              <span className="muted">支出合计</span>
              <strong className="bill-stat-value">
                ¥{data.meta.expenseTotal.toFixed(2)}
              </strong>
            </div>
            <div className="bill-stat">
              <span className="muted">收入合计</span>
              <strong className="bill-stat-value">
                ¥{data.meta.incomeTotal.toFixed(2)}
              </strong>
            </div>
            <div className="bill-stat">
              <span className="muted">交易笔数</span>
              <strong className="bill-stat-value">{data.meta.transactionCount}</strong>
            </div>
            <div className="bill-stat">
              <span className="muted">总流水</span>
              <strong className="bill-stat-value">¥{totalAmount.toFixed(2)}</strong>
            </div>
          </div>
        </section>
      )}

      {data?.summaryByCategory && (
        <section className="bill-panel">
          <div className="bill-section-header">
            <h3>分类支出分布</h3>
          </div>
          <div className="bill-category-grid">
            {data.categories?.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`bill-category-chip ${detailCategory === cat ? 'bill-category-chip-active' : ''}`}
                onClick={() => setDetailCategory(cat)}
              >
                <span>{cat}</span>
                <strong>¥{(data.summaryByCategory?.[cat] ?? 0).toFixed(2)}</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      {detailCategory && (
        <section className="bill-panel">
          <div className="bill-section-header">
            <h3>{detailCategory} 支出 Top 10</h3>
            <span className="muted">按金额降序</span>
          </div>
          {topCategoryTransactions.length === 0 ? (
            <p className="muted">该分类暂无支出记录</p>
          ) : (
            <div className="bill-table-wrap">
              <table className="bill-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>金额</th>
                    <th>交易对方</th>
                    <th>商品</th>
                  </tr>
                </thead>
                <tbody>
                  {topCategoryTransactions.map((row, index) => (
                    <tr key={`${row.time}-${row.amount}-${index}`}>
                      <td>{row.time}</td>
                      <td className="bill-money-cell">¥{row.amount.toFixed(2)}</td>
                      <td className="bill-cell-ellipsis">{row.counterparty}</td>
                      <td className="bill-cell-ellipsis">{row.product || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {data?.transactions && data.transactions.length > 0 && (
        <section className="bill-panel">
          <div className="bill-section-header">
            <h3>全部交易明细</h3>
            <span className="muted">共 {data.transactions.length} 条</span>
          </div>
          <div className="bill-table-wrap">
            <table className="bill-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类别</th>
                  <th>收/支</th>
                  <th>金额</th>
                  <th>交易对方</th>
                  <th>商品</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((row, i) => (
                  <tr key={`${row.time}-${i}`}>
                    <td>{row.time}</td>
                    <td>
                      <span className="bill-cat-tag">{row.category}</span>
                    </td>
                    <td>{row.direction}</td>
                    <td className="bill-money-cell">¥{row.amount.toFixed(2)}</td>
                    <td className="bill-cell-ellipsis">{row.counterparty}</td>
                    <td className="bill-cell-ellipsis">{row.product || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  )
}
