import { useEffect, useState } from 'react'

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
  lat?: number | null
  lon?: number | null
}

function formatMmDd(dateText: string): string {
  if (!dateText) return '--'
  const date = new Date(`${dateText}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateText
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

function buildTemperatureChart(forecast: WeatherDay[]) {
  const width = 560
  const height = 160
  const padding = { top: 18, right: 20, bottom: 28, left: 20 }
  const items = forecast.filter((item) => item.maxTempC !== null && item.minTempC !== null)
  if (items.length === 0) return null

  const temperatures = items.flatMap((item) => [item.maxTempC!, item.minTempC!])
  const tempMin = Math.min(...temperatures)
  const tempMax = Math.max(...temperatures)
  const range = Math.max(1, tempMax - tempMin)

  const xAt = (index: number) => {
    if (items.length === 1) return width / 2
    return padding.left + (index * (width - padding.left - padding.right)) / (items.length - 1)
  }
  const yAt = (temp: number) =>
    padding.top + ((tempMax - temp) / range) * (height - padding.top - padding.bottom)

  const maxLine = items.map((item, index) => `${xAt(index)},${yAt(item.maxTempC!)}`).join(' ')
  const minLine = items.map((item, index) => `${xAt(index)},${yAt(item.minTempC!)}`).join(' ')

  return { width, height, items, maxLine, minLine, xAt, yAt, tempMin, tempMax }
}

/**
 * 天气小组件：优先使用浏览器 GPS 定位，失败回退到 IP 定位，
 * 展示最近 3 天的温度趋势图与每日明细。
 */
export function WeatherWidget() {
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
        let city = ''
        let lat: number | null = null
        let lon: number | null = null

        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error('定位超时')), 6000)
              navigator.geolocation.getCurrentPosition(
                (p) => { clearTimeout(timer); resolve(p) },
                (err) => { clearTimeout(timer); reject(err) },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 },
              )
            })
            lat = pos.coords.latitude
            lon = pos.coords.longitude
          } catch {
            // GPS 失败则回退 IP 定位
          }
        }

        if (lat === null || lon === null) {
          try {
            const cityResponse = await fetch('/api/weather/city-by-ip')
            const cityJson = (await cityResponse.json()) as IpCityResponse
            if (cityResponse.ok && cityJson?.ok && typeof cityJson.city === 'string') {
              city = cityJson.city.trim()
              lat = typeof cityJson.lat === 'number' ? cityJson.lat : null
              lon = typeof cityJson.lon === 'number' ? cityJson.lon : null
            }
          } catch {
            city = ''
          }
        }

        let weatherUrl: string
        if (lat !== null && lon !== null) {
          const params = new URLSearchParams({ days: '3', lat: String(lat), lon: String(lon) })
          if (city) params.set('city', city)
          weatherUrl = `/api/weather/recent?${params.toString()}`
        } else if (city) {
          weatherUrl = `/api/weather/recent?days=3&city=${encodeURIComponent(city)}`
        } else {
          weatherUrl = '/api/weather/recent?days=3'
        }
        const response = await fetch(weatherUrl)
        const json = (await response.json()) as RecentWeatherResponse
        if (!response.ok || !json.ok) {
          throw new Error(json.message || `HTTP ${response.status}`)
        }
        if (!cancelled) setWeatherData(json)
      } catch (error) {
        if (!cancelled) setWeatherError((error as Error).message)
      } finally {
        if (!cancelled) setWeatherLoading(false)
      }
    }

    loadWeather()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="weather-widget">
      <div className="dash-card-header">
        <h3>最近 3 天天气</h3>
        <span className="muted">
          {weatherData?.city || '加载中'}
          {weatherData?.availableDays ? ` · ${weatherData.availableDays} 天` : ''}
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
                <span><i className="weather-legend-dot weather-legend-dot-max" />最高温</span>
                <span><i className="weather-legend-dot weather-legend-dot-min" />最低温</span>
              </div>
              <svg
                className="weather-chart"
                viewBox={`0 0 ${weatherChart.width} ${weatherChart.height}`}
                role="img"
                aria-label="最近天气温度趋势图"
              >
                <line x1="20" y1="18" x2="20" y2={weatherChart.height - 28} className="weather-chart-axis" />
                <line x1="20" y1={weatherChart.height - 28} x2={weatherChart.width - 20} y2={weatherChart.height - 28} className="weather-chart-axis" />
                <polyline points={weatherChart.maxLine} className="weather-chart-line-max" />
                <polyline points={weatherChart.minLine} className="weather-chart-line-min" />
                {weatherChart.items.map((item, index) => (
                  <g key={`${item.date}-${index}`}>
                    <circle cx={weatherChart.xAt(index)} cy={weatherChart.yAt(item.maxTempC!)} r="3" className="weather-chart-point-max" />
                    <circle cx={weatherChart.xAt(index)} cy={weatherChart.yAt(item.minTempC!)} r="3" className="weather-chart-point-min" />
                    <text x={weatherChart.xAt(index)} y={weatherChart.height - 10} textAnchor="middle" className="weather-chart-label">
                      {formatMmDd(item.date)}
                    </text>
                  </g>
                ))}
                <text x="4" y="22" className="weather-chart-temp-label">{weatherChart.tempMax}°</text>
                <text x="4" y={weatherChart.height - 32} className="weather-chart-temp-label">{weatherChart.tempMin}°</text>
              </svg>
            </div>
          )}
          <ul className="weather-list">
            {weatherData.forecast.map((item) => (
              <li key={item.date}>
                <strong>{formatMmDd(item.date)}</strong>
                <span>{item.weather}</span>
                <span>{item.minTempC ?? '--'}°C ~ {item.maxTempC ?? '--'}°C</span>
                <span>湿度 {item.humidity ?? '--'}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
