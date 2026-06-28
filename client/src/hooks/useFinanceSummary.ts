import { useCallback, useEffect, useRef, useState } from 'react'
import { requestWithFetch } from '../services/http'

type AccountItem = { id: string; amount: number }
type AccountGroup = { id: string; title: string; items: AccountItem[] }
type AssetsResponse = { ok: boolean; groups: AccountGroup[] }

type RecurringExpense = { id: string; amount: number; cycle: 'monthly' | 'yearly' }
type SubsResponse = { ok: boolean; items: RecurringExpense[] }

export type FinanceSummary = {
  netAsset: number
  totalAsset: number
  totalDebt: number
  monthlyFixed: number
  yearlyFixed: number
  loading: boolean
  error: string | null
}

function toMonthly(item: RecurringExpense) {
  return item.cycle === 'monthly' ? item.amount : item.amount / 12
}

/**
 * 聚合资产与固定支出，得出净资产 / 总资产 / 总负债 / 每月固定支出。
 * 概览页的财务快照与财务中心的汇总头共用，实现跨页数据整合。
 */
export function useFinanceSummary(): FinanceSummary & { reload: () => void } {
  const [summary, setSummary] = useState<FinanceSummary>({
    netAsset: 0,
    totalAsset: 0,
    totalDebt: 0,
    monthlyFixed: 0,
    yearlyFixed: 0,
    loading: true,
    error: null,
  })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (mountedRef.current) setSummary((p) => ({ ...p, loading: true, error: null }))
    try {
      const [assets, subs] = await Promise.all([
        requestWithFetch<AssetsResponse>('/api/assets'),
        requestWithFetch<SubsResponse>('/api/subscriptions'),
      ])
      const amounts = (assets.groups ?? []).flatMap((g) => g.items.map((i) => i.amount))
      const totalAsset = amounts.filter((a) => a > 0).reduce((s, a) => s + a, 0)
      const totalDebt = Math.abs(amounts.filter((a) => a < 0).reduce((s, a) => s + a, 0))
      const monthlyFixed = (subs.items ?? []).reduce((s, i) => s + toMonthly(i), 0)
      if (mountedRef.current) {
        setSummary({
          netAsset: totalAsset - totalDebt,
          totalAsset,
          totalDebt,
          monthlyFixed,
          yearlyFixed: monthlyFixed * 12,
          loading: false,
          error: null,
        })
      }
    } catch (err) {
      if (mountedRef.current) {
        setSummary((p) => ({ ...p, loading: false, error: err instanceof Error ? err.message : '财务数据读取失败' }))
      }
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { ...summary, reload: load }
}
