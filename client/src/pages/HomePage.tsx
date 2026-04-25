import { useEffect, useState } from 'react'

type PriorityTask = {
  id: string
  title: string
  done: boolean
}

type CountdownItem = {
  id: string
  label: string
  date: string
}

const mockTasks: PriorityTask[] = [
  { id: 't1', title: '完成 Dashboard 首页模块', done: true },
  { id: 't2', title: '整理下周工作计划', done: false },
  { id: 't3', title: '30 分钟英语阅读', done: false },
]

const mockCountdowns: CountdownItem[] = [
  { id: 'c1', label: '发薪日', date: '2026-05-10' },
  { id: 'c2', label: '房租日', date: '2026-05-03' },
  { id: 'c3', label: '信用卡还款', date: '2026-05-08' },
]

const mockBudget = {
  month: '2026-04',
  total: 12000,
  used: 7830,
}

type WeatherDay = {
  date: string
  weather: string
  maxTempC: number | null
  minTempC: number | null
  humidity: number | null
}

type RecentWeatherResponse = {
  ok: boolean
  message?: string
  city: string
  days: number
  source?: string
  availableDays?: number
  forecast: WeatherDay[]
}

function formatMmDd(dateText: string): string {
  if (!dateText) return '--'
  const date = new Date(`${dateText}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateText
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

function getDaysLeft(dateString: string): number {
  const now = new Date()
  const target = new Date(dateString)
  const oneDayMs = 24 * 60 * 60 * 1000
  const diff = target.getTime() - now.getTime()
  return Math.ceil(diff / oneDayMs)
}

function buildTemperatureChart(forecast: WeatherDay[]) {
  const width = 560
  const height = 160
  const padding = { top: 18, right: 20, bottom: 28, left: 20 }
  const items = forecast.filter(
    (item) => item.maxTempC !== null && item.minTempC !== null,
  )
  if (items.length === 0) {
    return null
  }

  const temperatures = items.flatMap((item) => [item.maxTempC!, item.minTempC!])
  const tempMin = Math.min(...temperatures)
  const tempMax = Math.max(...temperatures)
  const range = Math.max(1, tempMax - tempMin)

  const xAt = (index: number) => {
    if (items.length === 1) return width / 2
    return (
      padding.left +
      (index * (width - padding.left - padding.right)) / (items.length - 1)
    )
  }
  const yAt = (temp: number) =>
    padding.top + ((tempMax - temp) / range) * (height - padding.top - padding.bottom)

  const maxLine = items
    .map((item, index) => `${xAt(index)},${yAt(item.maxTempC!)}`)
    .join(' ')
  const minLine = items
    .map((item, index) => `${xAt(index)},${yAt(item.minTempC!)}`)
    .join(' ')

  return {
    width,
    height,
    items,
    maxLine,
    minLine,
    xAt,
    yAt,
    tempMin,
    tempMax,
  }
}

export function HomePage() {
  const doneCount = mockTasks.filter((task) => task.done).length
  const budgetPercent = Math.min(
    100,
    Math.round((mockBudget.used / mockBudget.total) * 100),
  )
  const [weatherData, setWeatherData] = useState<RecentWeatherResponse | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const weatherChart = weatherData ? buildTemperatureChart(weatherData.forecast) : null

  useEffect(() => {
    let cancelled = false

    async function loadWeather() {
      setWeatherLoading(true)
      setWeatherError(null)
      try {
        const response = await fetch('/api/weather/recent?days=3')
        const json = (await response.json()) as RecentWeatherResponse
        if (!response.ok || !json.ok) {
          throw new Error(json.message || `HTTP ${response.status}`)
        }
        if (!cancelled) {
          setWeatherData(json)
        }
      } catch (error) {
        if (!cancelled) {
          setWeatherError((error as Error).message)
        }
      } finally {
        if (!cancelled) {
          setWeatherLoading(false)
        }
      }
    }

    loadWeather()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section>
      <h2>whoeven 的首页</h2>
      <p className="muted">个人 Dashboard（Mock 数据版本）</p>

      <div className="dashboard-grid">
        <article className="dash-card">
          <div className="dash-card-header">
            <h3>今日三件事</h3>
            <span>
              {doneCount}/{mockTasks.length}
            </span>
          </div>
          <ul className="task-list">
            {mockTasks.map((task) => (
              <li key={task.id} className={task.done ? 'task-done' : ''}>
                <span>{task.done ? '✅' : '⬜'}</span>
                <span>{task.title}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="dash-card">
          <h3>倒计时</h3>
          <ul className="countdown-list">
            {mockCountdowns.map((item) => {
              const daysLeft = getDaysLeft(item.date)
              return (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <strong>{daysLeft >= 0 ? `还有 ${daysLeft} 天` : '已过期'}</strong>
                </li>
              )
            })}
          </ul>
        </article>

        <article className="dash-card dash-card-full">
          <div className="dash-card-header">
            <h3>本月预算进度</h3>
            <span>{mockBudget.month}</span>
          </div>
          <p className="budget-text">
            已使用 ¥{mockBudget.used} / ¥{mockBudget.total}
          </p>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${budgetPercent}%` }} />
          </div>
          <p className="muted">预算使用率：{budgetPercent}%</p>
        </article>

        <article className="dash-card dash-card-full">
          <div className="dash-card-header">
            <h3>最近 3 天天气</h3>
            <span className="muted">
              {weatherData?.city || '加载中'}
              {weatherData?.availableDays
                ? ` · 已展示 ${weatherData.availableDays} 天`
                : ''}
            </span>
          </div>

          {weatherLoading && <p className="muted">天气加载中...</p>}
          {!weatherLoading && weatherError && (
            <p className="weather-error">天气读取失败：{weatherError}</p>
          )}

          {!weatherLoading && !weatherError && weatherData?.forecast?.length ? (
            <>
              {weatherChart && (
                <div className="weather-chart-wrap">
                  <div className="weather-chart-legend">
                    <span>
                      <i className="weather-legend-dot weather-legend-dot-max" />
                      最高温
                    </span>
                    <span>
                      <i className="weather-legend-dot weather-legend-dot-min" />
                      最低温
                    </span>
                  </div>
                  <svg
                    className="weather-chart"
                    viewBox={`0 0 ${weatherChart.width} ${weatherChart.height}`}
                    role="img"
                    aria-label="最近天气温度趋势图"
                  >
                    <line
                      x1="20"
                      y1="18"
                      x2="20"
                      y2={weatherChart.height - 28}
                      className="weather-chart-axis"
                    />
                    <line
                      x1="20"
                      y1={weatherChart.height - 28}
                      x2={weatherChart.width - 20}
                      y2={weatherChart.height - 28}
                      className="weather-chart-axis"
                    />
                    <polyline points={weatherChart.maxLine} className="weather-chart-line-max" />
                    <polyline points={weatherChart.minLine} className="weather-chart-line-min" />
                    {weatherChart.items.map((item, index) => (
                      <g key={`${item.date}-${index}`}>
                        <circle
                          cx={weatherChart.xAt(index)}
                          cy={weatherChart.yAt(item.maxTempC!)}
                          r="3"
                          className="weather-chart-point-max"
                        />
                        <circle
                          cx={weatherChart.xAt(index)}
                          cy={weatherChart.yAt(item.minTempC!)}
                          r="3"
                          className="weather-chart-point-min"
                        />
                        <text
                          x={weatherChart.xAt(index)}
                          y={weatherChart.height - 10}
                          textAnchor="middle"
                          className="weather-chart-label"
                        >
                          {formatMmDd(item.date)}
                        </text>
                      </g>
                    ))}
                    <text x="4" y="22" className="weather-chart-temp-label">
                      {weatherChart.tempMax}°
                    </text>
                    <text
                      x="4"
                      y={weatherChart.height - 32}
                      className="weather-chart-temp-label"
                    >
                      {weatherChart.tempMin}°
                    </text>
                  </svg>
                </div>
              )}

              <ul className="weather-list">
                {weatherData.forecast.map((item) => (
                  <li key={item.date}>
                    <strong>{formatMmDd(item.date)}</strong>
                    <span>{item.weather}</span>
                    <span>
                      {item.minTempC ?? '--'}°C ~ {item.maxTempC ?? '--'}°C
                    </span>
                    <span>湿度 {item.humidity ?? '--'}%</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </article>

      </div>
    </section>
  )
}
