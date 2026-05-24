import { useCallback, useEffect, useRef, useState } from 'react'
import { AiChatBox } from '../components/AiChatBox'
import { requestWithFetch } from '../services/http'

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

type IpCityResponse = {
  ok: boolean
  city?: string
}

type TodoItem = {
  id: string
  text: string
  done: boolean
  pinned: boolean
  hidden: boolean
  time: string
  createdAt: string
  updatedAt: string
}

type TodoApiResponse = {
  ok: boolean
  items: TodoItem[]
  updatedAt: string | null
  message?: string
}

function formatMmDd(dateText: string): string {
  if (!dateText) return '--'
  const date = new Date(`${dateText}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateText
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

function formatTodoTime(dateText: string): string {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) return '时间未设置'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function toDateTimeLocalValue(dateText: string): string {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

function toDateStartLocalValue(dateText: string): string {
  const full = toDateTimeLocalValue(dateText)
  if (!full) return ''
  return `${full.slice(0, 10)}T00:00`
}

function getStickyColorIndex(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 5
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
  const [weatherData, setWeatherData] = useState<RecentWeatherResponse | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [todoItems, setTodoItems] = useState<TodoItem[]>([])
  const [todoLoading, setTodoLoading] = useState(true)
  const [todoSaving, setTodoSaving] = useState(false)
  const [todoError, setTodoError] = useState<string | null>(null)
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoTime, setNewTodoTime] = useState('')
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editingTodoText, setEditingTodoText] = useState('')
  const [editingTodoTime, setEditingTodoTime] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const weatherChart = weatherData ? buildTemperatureChart(weatherData.forecast) : null
  const isMountedRef = useRef(true)

  const loadTodos = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true
    if (showLoading && isMountedRef.current) {
      setTodoLoading(true)
    }
    if (isMountedRef.current) {
      setTodoError(null)
    }
    try {
      const data = await requestWithFetch<TodoApiResponse>('/api/todos')
      if (isMountedRef.current) {
        setTodoItems(Array.isArray(data.items) ? data.items : [])
      }
    } catch (error) {
      if (isMountedRef.current) {
        setTodoError(error instanceof Error ? error.message : '待办读取失败')
      }
    } finally {
      if (showLoading && isMountedRef.current) {
        setTodoLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadWeather() {
      setWeatherLoading(true)
      setWeatherError(null)
      try {
        let city = ''
        try {
          const cityResponse = await fetch('/api/weather/city-by-ip')
          const cityJson = (await cityResponse.json()) as IpCityResponse
          if (cityResponse.ok && cityJson?.ok && typeof cityJson.city === 'string') {
            city = cityJson.city.trim()
          }
        } catch {
          city = ''
        }

        const weatherUrl = city
          ? `/api/weather/recent?days=3&city=${encodeURIComponent(city)}`
          : '/api/weather/recent?days=3'
        const response = await fetch(weatherUrl)
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

  useEffect(() => {
    void loadTodos()
  }, [loadTodos])

  useEffect(() => {
    const handleTodoChanged = () => {
      void loadTodos({ showLoading: false })
    }
    window.addEventListener('todos:changed', handleTodoChanged)
    return () => {
      window.removeEventListener('todos:changed', handleTodoChanged)
    }
  }, [loadTodos])

  async function createTodo() {
    const text = newTodoText.trim()
    if (!text) return
    setTodoSaving(true)
    setTodoError(null)
    try {
      const data = await requestWithFetch<TodoApiResponse>('/api/todos', {
        method: 'POST',
        body: JSON.stringify({ text, time: newTodoTime || undefined }),
      })
      setTodoItems(Array.isArray(data.items) ? data.items : [])
      setNewTodoText('')
      setNewTodoTime('')
    } catch (error) {
      setTodoError(error instanceof Error ? error.message : '待办新增失败')
    } finally {
      setTodoSaving(false)
    }
  }

  async function toggleTodo(item: TodoItem) {
    setTodoSaving(true)
    setTodoError(null)
    try {
      const data = await requestWithFetch<TodoApiResponse>(`/api/todos/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ done: !item.done }),
      })
      setTodoItems(Array.isArray(data.items) ? data.items : [])
    } catch (error) {
      setTodoError(error instanceof Error ? error.message : '待办更新失败')
    } finally {
      setTodoSaving(false)
    }
  }

  function startEditTodo(item: TodoItem) {
    setEditingTodoId(item.id)
    setEditingTodoText(item.text)
    setEditingTodoTime(toDateStartLocalValue(item.time || item.createdAt))
  }

  async function saveEditTodo(
    item: TodoItem,
    draft?: {
      text?: string
      time?: string
    },
  ) {
    const text = (draft?.text ?? editingTodoText).trim()
    const time = (draft?.time ?? editingTodoTime).trim()
    const normalizedCurrentTime = toDateTimeLocalValue(item.time || item.createdAt)
    const textChanged = text && text !== item.text
    const timeChanged = time !== normalizedCurrentTime
    if (!text || (!textChanged && !timeChanged)) {
      setEditingTodoId(null)
      setEditingTodoText('')
      setEditingTodoTime('')
      return
    }
    setTodoSaving(true)
    setTodoError(null)
    try {
      const data = await requestWithFetch<TodoApiResponse>(`/api/todos/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          text,
          time: time || undefined,
        }),
      })
      setTodoItems(Array.isArray(data.items) ? data.items : [])
      setEditingTodoId(null)
      setEditingTodoText('')
      setEditingTodoTime('')
    } catch (error) {
      setTodoError(error instanceof Error ? error.message : '待办更新失败')
    } finally {
      setTodoSaving(false)
    }
  }

  useEffect(() => {
    if (!editingTodoId) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      const targetElement = event.target as HTMLElement | null
      const editContainer = document.querySelector(
        `[data-todo-edit-container="${editingTodoId}"]`,
      ) as HTMLElement | null
      if (editContainer && target && editContainer.contains(target)) {
        const clickedInteractive = targetElement?.closest(
          'input, textarea, select, button, .todo-time-input-shell',
        )
        if (clickedInteractive) return
      }
      const currentItem = todoItems.find((item) => item.id === editingTodoId)
      if (!currentItem) return
      window.setTimeout(() => {
        const textInput = document.querySelector(
          `[data-todo-edit-text-for="${editingTodoId}"]`,
        ) as HTMLTextAreaElement | null
        const timeInput = document.querySelector(
          `input[data-todo-edit-time-for="${editingTodoId}"]`,
        ) as HTMLInputElement | null
        void saveEditTodo(currentItem, {
          text: textInput?.value ?? editingTodoText,
          time: timeInput?.value ?? editingTodoTime,
        })
      }, 0)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [editingTodoId, editingTodoText, editingTodoTime, todoItems])

  async function removeTodo(item: TodoItem) {
    setTodoSaving(true)
    setTodoError(null)
    try {
      const data = await requestWithFetch<TodoApiResponse>(`/api/todos/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      })
      setTodoItems(Array.isArray(data.items) ? data.items : [])
      if (editingTodoId === item.id) {
        setEditingTodoId(null)
        setEditingTodoText('')
        setEditingTodoTime('')
      }
    } catch (error) {
      setTodoError(error instanceof Error ? error.message : '待办删除失败')
    } finally {
      setTodoSaving(false)
    }
  }

  async function togglePin(item: TodoItem) {
    setTodoSaving(true)
    setTodoError(null)
    try {
      const data = await requestWithFetch<TodoApiResponse>(`/api/todos/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ pinned: !item.pinned }),
      })
      setTodoItems(Array.isArray(data.items) ? data.items : [])
    } catch (error) {
      setTodoError(error instanceof Error ? error.message : '待办更新失败')
    } finally {
      setTodoSaving(false)
    }
  }

  async function toggleHide(item: TodoItem) {
    setTodoSaving(true)
    setTodoError(null)
    try {
      const data = await requestWithFetch<TodoApiResponse>(`/api/todos/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ hidden: !item.hidden }),
      })
      setTodoItems(Array.isArray(data.items) ? data.items : [])
    } catch (error) {
      setTodoError(error instanceof Error ? error.message : '待办更新失败')
    } finally {
      setTodoSaving(false)
    }
  }

  const pinnedTodos = todoItems.filter((i) => i.pinned && !i.hidden)
  const regularTodos = todoItems.filter((i) => !i.pinned && !i.hidden)
  const hiddenTodos = todoItems.filter((i) => i.hidden)

  function renderStickyNote(item: TodoItem, isInHiddenSection = false) {
    const colorIndex = getStickyColorIndex(item.id)
    const isEditing = editingTodoId === item.id
    return (
      <div
        key={item.id}
        className={['sticky-note', `sticky-note-${colorIndex}`, item.done ? 'is-done' : '', isEditing ? 'is-editing' : ''].filter(Boolean).join(' ')}
      >
        {item.pinned && !isInHiddenSection && (
          <span className="sticky-pin-badge" title="已置顶">📌</span>
        )}
        {isEditing ? (
          <div className="sticky-note-edit-mode" data-todo-edit-container={item.id}>
            <textarea
              className="sticky-note-textarea"
              autoFocus
              data-todo-edit-text-for={item.id}
              value={editingTodoText}
              disabled={todoSaving}
              onChange={(e) => setEditingTodoText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setEditingTodoId(null)
                  setEditingTodoText('')
                  setEditingTodoTime('')
                }
              }}
            />
            <div
              className="todo-time-input-shell"
              onClick={() => {
                const input = document.querySelector(
                  `input[data-todo-edit-time-for="${item.id}"]`,
                ) as HTMLInputElement | null
                if (!input || input.disabled) return
                input.focus()
                if (typeof input.showPicker === 'function') {
                  input.showPicker()
                }
              }}
            >
              <input
                className="todo-input todo-time-input todo-edit-time-input"
                type="datetime-local"
                data-todo-edit-time-for={item.id}
                value={editingTodoTime}
                disabled={todoSaving}
                onChange={(e) => setEditingTodoTime(e.target.value)}
              />
            </div>
            <div className="sticky-note-edit-btns">
              <button type="button" disabled={todoSaving} onClick={() => void saveEditTodo(item)}>
                保存
              </button>
              <button
                type="button"
                disabled={todoSaving}
                onClick={() => {
                  setEditingTodoId(null)
                  setEditingTodoText('')
                  setEditingTodoTime('')
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={`sticky-note-text${item.done ? ' done' : ''}`}>{item.text}</p>
            <span className="sticky-note-time">{formatTodoTime(item.time || item.createdAt)}</span>
            <div className="sticky-note-actions">
              {!isInHiddenSection ? (
                <>
                  <button className="sticky-note-btn" type="button" disabled={todoSaving} onClick={() => void toggleTodo(item)}>
                    {item.done ? '↩ 撤销' : '✓ 完成'}
                  </button>
                  <button className="sticky-note-btn" type="button" disabled={todoSaving} onClick={() => void togglePin(item)}>
                    {item.pinned ? '取消置顶' : '📌 置顶'}
                  </button>
                  <button className="sticky-note-btn" type="button" disabled={todoSaving} onClick={() => void toggleHide(item)}>
                    隐藏
                  </button>
                  <button className="sticky-note-btn" type="button" disabled={todoSaving} onClick={() => startEditTodo(item)}>
                    编辑
                  </button>
                  <button className="sticky-note-btn sticky-note-btn-danger" type="button" disabled={todoSaving} onClick={() => void removeTodo(item)}>
                    删除
                  </button>
                </>
              ) : (
                <>
                  <button className="sticky-note-btn" type="button" disabled={todoSaving} onClick={() => void toggleHide(item)}>
                    恢复显示
                  </button>
                  <button className="sticky-note-btn sticky-note-btn-danger" type="button" disabled={todoSaving} onClick={() => void removeTodo(item)}>
                    删除
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <section className="page-shell home-page-fit">
      <header className="page-hero">
        <h2>今日概览</h2>
        <p className="muted">在一个页面里快速处理待办、查看天气并与 AI 助手联动。</p>
      </header>
      <div className="home-layout">
        <div className="home-main">
        <article className="dash-card home-todo-card">
          <div className="todo-board-header">
            <div className="todo-board-title">
              <h3>待办事项</h3>
              {!todoLoading && todoItems.filter((i) => !i.hidden).length > 0 && (
                <span className="todo-board-count">
                  {todoItems.filter((i) => !i.hidden && i.done).length} / {todoItems.filter((i) => !i.hidden).length} 完成
                </span>
              )}
              {todoLoading && <span className="muted todo-board-loading">加载中…</span>}
            </div>
            {hiddenTodos.length > 0 && (
              <button
                type="button"
                className="todo-hidden-toggle"
                onClick={() => setShowHidden(!showHidden)}
              >
                {showHidden ? '收起已隐藏' : `${hiddenTodos.length} 个已隐藏`}
              </button>
            )}
          </div>

          <div className="todo-create-row">
            <input
              className="todo-input"
              value={newTodoText}
              placeholder="输入待办内容，回车添加"
              disabled={todoSaving}
              onChange={(event) => setNewTodoText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void createTodo()
                }
              }}
            />
            <input
              className="todo-input todo-time-input"
              type="datetime-local"
              value={newTodoTime}
              disabled={todoSaving}
              onChange={(event) => setNewTodoTime(event.target.value)}
            />
            <button type="button" disabled={todoSaving || !newTodoText.trim()} onClick={() => void createTodo()}>
              添加
            </button>
          </div>

          {todoError ? <p className="weather-error">待办操作失败：{todoError}</p> : null}
          {!todoLoading && todoItems.filter((i) => !i.hidden).length === 0 && (
            <p className="muted">暂无待办，先加一条吧。</p>
          )}

          {pinnedTodos.length > 0 && (
            <div className="sticky-section">
              <div className="sticky-section-label">📌 置顶</div>
              <div className="sticky-board">
                {pinnedTodos.map((item) => renderStickyNote(item))}
              </div>
            </div>
          )}

          {regularTodos.length > 0 && (
            <div className={pinnedTodos.length > 0 ? 'sticky-section' : ''}>
              {pinnedTodos.length > 0 && <div className="sticky-section-label">其他待办</div>}
              <div className="sticky-board">
                {regularTodos.map((item) => renderStickyNote(item))}
              </div>
            </div>
          )}

          {showHidden && hiddenTodos.length > 0 && (
            <div className="sticky-section sticky-section-dimmed">
              <div className="sticky-section-label">已隐藏</div>
              <div className="sticky-board">
                {hiddenTodos.map((item) => renderStickyNote(item, true))}
              </div>
            </div>
          )}
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

        <aside className="home-ai-side">
          <AiChatBox />
        </aside>
      </div>
    </section>
  )
}
