import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HealthSeriesChart } from '../components/HealthSeriesChart'
import { useFinanceSummary } from '../hooks/useFinanceSummary'
import { bmiCategory, computeBmi, computeHealthSummary, useHealth } from '../hooks/useHealth'
import { formatTodoTime, useTodos, type TodoItem } from '../hooks/useTodos'

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function greetingFor(hour: number): string {
  if (hour < 5) return '夜深了'
  if (hour < 9) return '早上好'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  if (hour < 23) return '晚上好'
  return '夜深了'
}

function formatMoney(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 当前时间是否已超过该待办的设定时间 */
function isOverdue(item: TodoItem): boolean {
  if (item.done) return false
  const t = new Date(item.time || item.createdAt)
  if (Number.isNaN(t.getTime())) return false
  return t.getTime() < Date.now()
}

export function OverviewPage() {
  const now = useClock()
  const finance = useFinanceSummary()
  const health = useHealth()
  const healthSummary = useMemo(() => computeHealthSummary(health.data), [health.data])
  const { items, loading: todosLoading, saving, createTodo, patchTodo } = useTodos()
  const [quickText, setQuickText] = useState('')

  const greeting = greetingFor(now.getHours())
  const dateLabel = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${WEEKDAYS[now.getDay()]}`

  const healthSeries = useMemo(
    () => [
      {
        key: 'weight',
        label: '体重',
        color: '#2563eb',
        unit: 'kg',
        points: health.data.bodyMetrics
          .filter((b) => typeof b.weightKg === 'number')
          .map((b) => ({ date: b.date, value: b.weightKg as number })),
      },
      {
        key: 'fat',
        label: '体脂',
        color: '#d97706',
        unit: '%',
        points: health.data.bodyMetrics
          .filter((b) => typeof b.bodyFatPct === 'number')
          .map((b) => ({ date: b.date, value: b.bodyFatPct as number })),
      },
      {
        key: 'bmi',
        label: 'BMI',
        color: '#7c3aed',
        points: health.data.bodyMetrics
          .map((b) => ({ date: b.date, value: computeBmi(b.weightKg, health.data.profile.heightCm) }))
          .filter((p): p is { date: string; value: number } => p.value != null),
      },
    ],
    [health.data.bodyMetrics, health.data.profile.heightCm],
  )
  const timeLabel = now.toLocaleTimeString('zh-CN', { hour12: false })

  const focusTodos = useMemo(() => {
    const active = items.filter((i) => !i.hidden && !i.done)
    return [...active]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        const ta = new Date(a.time || a.createdAt).getTime()
        const tb = new Date(b.time || b.createdAt).getTime()
        return ta - tb
      })
      .slice(0, 6)
  }, [items])

  const visibleTodos = items.filter((i) => !i.hidden)
  const doneCount = visibleTodos.filter((i) => i.done).length
  const overdueCount = items.filter((i) => !i.hidden && isOverdue(i)).length

  async function handleQuickAdd() {
    const text = quickText.trim()
    if (!text) return
    const ok = await createTodo(text)
    if (ok) setQuickText('')
  }

  return (
    <div className="ov-page">
      {/* 顶部问候 + 实时时钟 */}
      <section className="ov-hero">
        <div className="ov-hero-greet">
          <p className="ov-hero-eyebrow">SkyBoard 概览</p>
          <h2>{greeting}，欢迎回来 👋</h2>
          <p className="ov-hero-date">{dateLabel}</p>
        </div>
        <div className="ov-hero-clock">
          <span className="ov-clock-time">{timeLabel}</span>
        </div>
      </section>

      <div className="ov-grid">
        {/* 财务快照 */}
        <Link to="/finance" className="ov-card ov-card-finance">
          <div className="ov-card-head">
            <h3>财务快照</h3>
            <span className="ov-card-link">进入财务中心 →</span>
          </div>
          {finance.loading ? (
            <p className="muted">加载中…</p>
          ) : finance.error ? (
            <p className="weather-error">{finance.error}</p>
          ) : (
            <>
              <div className="ov-net">
                <span className="ov-net-label">净资产</span>
                <span className={`ov-net-value${finance.netAsset < 0 ? ' is-neg' : ''}`}>
                  ¥ {formatMoney(Math.abs(finance.netAsset))}
                </span>
              </div>
              <div className="ov-finance-row">
                <div className="ov-finance-cell">
                  <span className="ov-finance-cell-label">总资产</span>
                  <span className="ov-finance-cell-value ov-pos">¥{formatMoney(finance.totalAsset)}</span>
                </div>
                <div className="ov-finance-cell">
                  <span className="ov-finance-cell-label">总负债</span>
                  <span className="ov-finance-cell-value ov-neg">¥{formatMoney(finance.totalDebt)}</span>
                </div>
                <div className="ov-finance-cell">
                  <span className="ov-finance-cell-label">每月固定支出</span>
                  <span className="ov-finance-cell-value">¥{formatMoney(finance.monthlyFixed)}</span>
                </div>
              </div>
            </>
          )}
        </Link>

        {/* 今日待办 */}
        <section className="ov-card ov-card-todos">
          <div className="ov-card-head">
            <h3>今日待办</h3>
            <Link to="/workspace" className="ov-card-link">查看全部 →</Link>
          </div>
          <div className="ov-todo-stat">
            <span>{doneCount} / {visibleTodos.length} 完成</span>
            {overdueCount > 0 && <span className="ov-overdue-pill">{overdueCount} 项已逾期</span>}
          </div>
          <div className="ov-quickadd">
            <input
              className="todo-input"
              placeholder="快速添加待办，回车保存"
              value={quickText}
              disabled={saving}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleQuickAdd()
                }
              }}
            />
            <button type="button" disabled={saving || !quickText.trim()} onClick={() => void handleQuickAdd()}>
              添加
            </button>
          </div>
          <ul className="ov-todo-list">
            {todosLoading && <li className="muted">加载中…</li>}
            {!todosLoading && focusTodos.length === 0 && <li className="muted">全部完成，休息一下 🎉</li>}
            {focusTodos.map((item) => (
              <li key={item.id} className={`ov-todo-item${isOverdue(item) ? ' is-overdue' : ''}`}>
                <button
                  type="button"
                  className="ov-todo-check"
                  title="标记完成"
                  disabled={saving}
                  onClick={() => void patchTodo(item.id, { done: true })}
                />
                <span className="ov-todo-text">
                  {item.pinned && <span className="ov-todo-pin">📌</span>}
                  {item.text}
                </span>
                <span className="ov-todo-time">{formatTodoTime(item.time || item.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 健康概览（替代原天气栏） */}
        <Link to="/health" className="ov-card ov-card-health">
          <div className="ov-card-head">
            <h3>健康概览</h3>
            <span className="ov-card-link">进入健康中心 →</span>
          </div>
          {health.loading ? (
            <p className="muted">加载中…</p>
          ) : health.error ? (
            <p className="weather-error">{health.error}</p>
          ) : (
            <>
              <div className="ov-health-metrics">
                <div className="ov-health-cell">
                  <span className="ov-health-label">体重</span>
                  <span className="ov-health-value">
                    {healthSummary.latestWeight != null ? healthSummary.latestWeight.toFixed(1) : '--'}
                    <small> kg</small>
                    {healthSummary.weightDelta != null && healthSummary.weightDelta !== 0 && (
                      <small className={`health-delta ${healthSummary.weightDelta < 0 ? 'down' : 'up'}`}>
                        {healthSummary.weightDelta < 0 ? '▼' : '▲'}{Math.abs(healthSummary.weightDelta).toFixed(1)}
                      </small>
                    )}
                  </span>
                </div>
                <div className="ov-health-cell">
                  <span className="ov-health-label">BMI</span>
                  <span className="ov-health-value">
                    {healthSummary.bmi != null ? healthSummary.bmi.toFixed(1) : '--'}
                    {(() => {
                      const cat = bmiCategory(healthSummary.bmi)
                      return cat ? <small className={`health-bmi-tag health-bmi-${cat.tone}`}>{cat.label}</small> : null
                    })()}
                  </span>
                </div>
                <div className="ov-health-cell">
                  <span className="ov-health-label">体脂</span>
                  <span className="ov-health-value">
                    {healthSummary.latestBodyFat != null ? healthSummary.latestBodyFat.toFixed(1) : '--'}<small> %</small>
                  </span>
                </div>
                <div className="ov-health-cell">
                  <span className="ov-health-label">本周运动</span>
                  <span className="ov-health-value">{healthSummary.exerciseCount7d}<small> 次</small></span>
                </div>
                <div className="ov-health-cell">
                  <span className="ov-health-label">近7天均睡</span>
                  <span className="ov-health-value">
                    {healthSummary.avgSleep7d != null ? healthSummary.avgSleep7d.toFixed(1) : '--'}<small> h</small>
                  </span>
                </div>
              </div>
              {healthSummary.weightSeries.length > 1 ? (
                <HealthSeriesChart series={healthSeries} normalize="independent" height={140} />
              ) : (
                <p className="muted ov-health-hint">记录两次以上体重即可看到趋势图。</p>
              )}
            </>
          )}
        </Link>

        {/* 快捷入口 */}
        <section className="ov-card ov-card-quick">
          <div className="ov-card-head">
            <h3>快捷入口</h3>
          </div>
          <div className="ov-quicklinks">
            <Link to="/finance" className="ov-quicklink">
              <span className="ov-quicklink-icon">💰</span>
              <span className="ov-quicklink-label">财务中心</span>
              <span className="ov-quicklink-sub">资产 · 支出 · 账单</span>
            </Link>
            <Link to="/workspace" className="ov-quicklink">
              <span className="ov-quicklink-icon">🗂️</span>
              <span className="ov-quicklink-label">工作台</span>
              <span className="ov-quicklink-sub">待办 · 备忘</span>
            </Link>
            <Link to="/assistant" className="ov-quicklink">
              <span className="ov-quicklink-icon">🤖</span>
              <span className="ov-quicklink-label">AI 助手</span>
              <span className="ov-quicklink-sub">天气 · 待办对话</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
