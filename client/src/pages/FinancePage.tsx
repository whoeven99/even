import { useState } from 'react'
import { AssetManagerPage } from './AssetManagerPage'
import { BillImportPage } from './BillImportPage'
import { SubscriptionWidget } from '../components/SubscriptionWidget'
import { useFinanceSummary } from '../hooks/useFinanceSummary'

type FinanceTab = 'assets' | 'fixed' | 'bills'

const TABS: { key: FinanceTab; label: string; icon: string }[] = [
  { key: 'assets', label: '资产负债', icon: '🏦' },
  { key: 'fixed', label: '固定支出', icon: '🔁' },
  { key: 'bills', label: '账单分析', icon: '🧾' },
]

function formatMoney(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

export function FinancePage() {
  const [tab, setTab] = useState<FinanceTab>('assets')
  const finance = useFinanceSummary()

  return (
    <div className="hub-page">
      {/* 聚合财务概要头 */}
      <header className="hub-summary">
        <div className="hub-summary-title">
          <p className="ov-hero-eyebrow">财务中心</p>
          <h2>资产 · 支出 · 账单</h2>
        </div>
        <div className="hub-summary-metrics">
          <div className="hub-metric">
            <span className="hub-metric-label">净资产</span>
            <span className={`hub-metric-value${finance.netAsset < 0 ? ' ov-neg' : ''}`}>
              ¥{formatMoney(finance.netAsset)}
            </span>
          </div>
          <div className="hub-metric">
            <span className="hub-metric-label">总资产</span>
            <span className="hub-metric-value ov-pos">¥{formatMoney(finance.totalAsset)}</span>
          </div>
          <div className="hub-metric">
            <span className="hub-metric-label">总负债</span>
            <span className="hub-metric-value ov-neg">¥{formatMoney(finance.totalDebt)}</span>
          </div>
          <div className="hub-metric">
            <span className="hub-metric-label">每月固定支出</span>
            <span className="hub-metric-value">¥{formatMoney(finance.monthlyFixed)}</span>
          </div>
        </div>
      </header>

      {/* 标签栏 */}
      <nav className="hub-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`hub-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="hub-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="hub-body">
        {tab === 'assets' && <AssetManagerPage embedded />}
        {tab === 'fixed' && (
          <section className="page-shell">
            <div className="subs-page-wrap">
              <SubscriptionWidget />
            </div>
          </section>
        )}
        {tab === 'bills' && <BillImportPage embedded />}
      </div>
    </div>
  )
}
