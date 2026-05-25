const fs = require('fs')
const path = require('path')

// ── Persistent file cache (survives server restarts) ─────────────────────────
const CACHE_FILE = path.join(__dirname, '../../data/weather-cache.json')
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

function _loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) } catch { return {} }
}
function _saveCache(obj) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj))
  } catch {}
}
const _cache = _loadCache()

function _get(key) {
  const e = _cache[key]
  if (!e || Date.now() > e.exp) { delete _cache[key]; return null }
  return e.data
}
function _set(key, data) {
  _cache[key] = { data, exp: Date.now() + CACHE_TTL_MS }
  _saveCache(_cache)
}

// ── City aliases ─────────────────────────────────────────────────────────────
const CITY_ALIASES = {
  北京市: '北京', 帝都: '北京',
  魔都: '上海', 上海市: '上海',
  广州市: '广州', 羊城: '广州',
  深圳市: '深圳',
  杭州市: '杭州', 余杭: '杭州',
  天津市: '天津',
  重庆市: '重庆', 山城: '重庆',
  成都市: '成都', 蓉城: '成都',
  武汉市: '武汉', 江城: '武汉',
  西安市: '西安', 古都西安: '西安',
  南京市: '南京', 金陵: '南京',
  苏州市: '苏州', 姑苏: '苏州',
  宁波市: '宁波', 青岛市: '青岛', 济南市: '济南', 郑州市: '郑州',
  长沙市: '长沙', 星城: '长沙',
  福州市: '福州',
  厦门市: '厦门', 鹭岛: '厦门',
  昆明市: '昆明', 春城: '昆明',
  乌鲁木齐市: '乌鲁木齐',
  哈尔滨市: '哈尔滨', 冰城: '哈尔滨',
  石家庄市: '石家庄', 呼和浩特市: '呼和浩特',
  南宁市: '南宁', 海口市: '海口', 三亚市: '三亚',
}

const WEATHER_DEFAULT_CITY = process.env.DEFAULT_WEATHER_CITY || '杭州'

function sanitizeCityInput(input) {
  return String(input || '').replace(/[，。！？、,.!?]/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractCityFromWeatherQuery(input) {
  const text = sanitizeCityInput(input)
  if (!text) return ''
  if (CITY_ALIASES[text]) return CITY_ALIASES[text]
  const candidate = text
    .replace(/(帮我|麻烦|请|想问|问下|查下|查一?下|看下|看一?下|告诉我)/g, ' ')
    .replace(/(今天|明天|后天|现在|近期|最近|这几天|这两天)/g, ' ')
    .replace(/(天气|气温|温度|湿度|风力|风速|降雨|降水|预报|空气质量|体感)/g, ' ')
    .replace(/(怎么样|如何|多少|几度|冷不冷|热不热|吗|呢)/g, ' ')
    .replace(/\s+/g, ' ').trim()
  if (!candidate) return ''
  if (CITY_ALIASES[candidate]) return CITY_ALIASES[candidate]
  const m = candidate.match(/([\u4e00-\u9fa5]{2,}(?:市|自治州|地区|盟|特别行政区|县|区|旗)?)/)
  if (!m) return ''
  const normalized = m[1].replace(/特别行政区$|自治区$|自治州$|地区$|盟$|市$/, '').trim()
  if (!normalized) return ''
  return CITY_ALIASES[normalized] || normalized
}

function resolveCityQuery(inputCity) {
  const raw = sanitizeCityInput(inputCity)
  const city = extractCityFromWeatherQuery(raw) || raw
  if (!city) return { queryCity: WEATHER_DEFAULT_CITY, displayCity: WEATHER_DEFAULT_CITY }
  const aliased = CITY_ALIASES[city]
  if (aliased) return { queryCity: aliased, displayCity: aliased }
  return { queryCity: city, displayCity: city }
}

// ── Label helpers (for Open-Meteo fallback) ───────────────────────────────────
function weatherCodeToText(code) {
  const map = {
    0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
    45: '雾', 48: '雾凇',
    51: '小毛雨', 53: '毛毛雨', 55: '强毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '冰粒',
    80: '小阵雨', 81: '中阵雨', 82: '强阵雨',
    85: '小阵雪', 86: '强阵雪',
    95: '雷阵雨', 96: '雷阵雨夹小冰雹', 99: '雷阵雨夹大冰雹',
  }
  return map[code] || '未知'
}

// ── QWeather (和风天气) ────────────────────────────────────────────────────────
// Note: QWeather uses lon,lat order (longitude first)
const QWEATHER_KEY = process.env.QWEATHER_KEY || ''
const QW_BASE = 'https://devapi.qweather.com/v7'
const QW_GEO_BASE = 'https://geoapi.qweather.com/v2'

async function qwFetch(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`和风天气请求失败（HTTP ${res.status}）`)
  const data = await res.json()
  if (data.code !== '200') throw new Error(`和风天气错误码 ${data.code}`)
  return data
}

// Forecast by coordinates using QWeather
async function fetchQWeatherByCoords(lat, lon, safeDays) {
  const endpoint = safeDays <= 3 ? '3d' : '7d'
  const data = await qwFetch(`${QW_BASE}/weather/${endpoint}?location=${lon},${lat}&key=${QWEATHER_KEY}&lang=zh`)
  const rows = Array.isArray(data.daily) ? data.daily.slice(0, safeDays) : []
  if (rows.length === 0) throw new Error('和风天气未返回预报数据')
  return rows.map((item) => ({
    date: String(item.fxDate || ''),
    weather: String(item.textDay || '未知'),
    maxTempC: Number.isFinite(Number(item.tempMax)) ? Math.round(Number(item.tempMax)) : null,
    minTempC: Number.isFinite(Number(item.tempMin)) ? Math.round(Number(item.tempMin)) : null,
    humidity: Number.isFinite(Number(item.humidity)) ? Math.round(Number(item.humidity)) : null,
  }))
}

// Current conditions using QWeather (for AI chat)
async function fetchQWeatherNow(lat, lon) {
  const data = await qwFetch(`${QW_BASE}/weather/now?location=${lon},${lat}&key=${QWEATHER_KEY}&lang=zh`)
  const now = data.now
  if (!now) throw new Error('和风天气未返回实时数据')
  return {
    tempC: Math.round(Number(now.temp)),
    humidity: Math.round(Number(now.humidity)),
    weatherText: String(now.text || '未知'),
  }
}

// City name → coordinates using QWeather geo API
async function qwResolveCity(cityName) {
  const data = await qwFetch(`${QW_GEO_BASE}/city/lookup?location=${encodeURIComponent(cityName)}&key=${QWEATHER_KEY}&lang=zh`)
  const loc = data.location?.[0]
  if (!loc || !loc.lat || !loc.lon) throw new Error(`未找到城市「${cityName}」`)
  return { lat: Number(loc.lat), lon: Number(loc.lon), displayCity: String(loc.name) }
}

// ── Open-Meteo (fallback) ─────────────────────────────────────────────────────
async function fetchOpenMeteoByCoords(lat, lon, safeDays) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&timezone=auto&forecast_days=${safeDays}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Open-Meteo 请求失败（HTTP ${res.status}）`)
  const data = await res.json()
  const daily = data.daily
  const times = Array.isArray(daily?.time) ? daily.time : []
  if (times.length === 0) throw new Error('Open-Meteo 未返回预报数据')
  return times.slice(0, safeDays).map((date, i) => ({
    date: String(date || ''),
    weather: weatherCodeToText(Number((daily.weather_code || [])[i])),
    maxTempC: Number.isFinite(Number((daily.temperature_2m_max || [])[i])) ? Math.round(Number((daily.temperature_2m_max || [])[i])) : null,
    minTempC: Number.isFinite(Number((daily.temperature_2m_min || [])[i])) ? Math.round(Number((daily.temperature_2m_min || [])[i])) : null,
    humidity: Number.isFinite(Number((daily.relative_humidity_2m_mean || [])[i])) ? Math.round(Number((daily.relative_humidity_2m_mean || [])[i])) : null,
  }))
}

// Core: forecast by coords, with fallback
async function getForecastByCoords(lat, lon, safeDays) {
  if (QWEATHER_KEY) {
    try {
      const forecast = await fetchQWeatherByCoords(lat, lon, safeDays)
      return { forecast, source: 'qweather' }
    } catch (err) {
      console.warn('[weather] QWeather failed, trying Open-Meteo:', err.message)
    }
  }
  const forecast = await fetchOpenMeteoByCoords(lat, lon, safeDays)
  return { forecast, source: 'open-meteo' }
}

// City name → coords, QWeather first, Open-Meteo geocoding as fallback
async function resolveCoordsByCity(city) {
  if (QWEATHER_KEY) {
    try {
      return await qwResolveCity(city)
    } catch {}
  }
  // Open-Meteo geocoding fallback
  const resolved = resolveCityQuery(city)
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(resolved.queryCity)}&count=1&language=zh&format=json`
  const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) })
  if (!geoRes.ok) throw new Error(`地理编码失败（HTTP ${geoRes.status}）`)
  const geoData = await geoRes.json()
  const first = geoData?.results?.[0]
  if (!first) throw new Error(`未找到城市「${resolved.queryCity}」的位置`)
  return { lat: first.latitude, lon: first.longitude, displayCity: resolved.displayCity }
}

// ── Public: recent N-day forecast ────────────────────────────────────────────
// Accepts city string OR { city, lat, lon }
async function queryRecentWeatherDays(cityOrOptions, days = 3) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 3))

  const hasCoords =
    typeof cityOrOptions === 'object' &&
    cityOrOptions !== null &&
    Number.isFinite(Number(cityOrOptions.lat)) &&
    Number.isFinite(Number(cityOrOptions.lon))

  let lat, lon, cityName, cacheKey

  if (hasCoords) {
    lat = Number(cityOrOptions.lat)
    lon = Number(cityOrOptions.lon)
    cityName = String(cityOrOptions.city || WEATHER_DEFAULT_CITY)
    cacheKey = `c:${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)},${safeDays}`
  } else {
    const city = typeof cityOrOptions === 'string' ? cityOrOptions : String(cityOrOptions || WEATHER_DEFAULT_CITY)
    const resolved = resolveCityQuery(city)
    cacheKey = `n:${resolved.queryCity},${safeDays}`
    const cached = _get(cacheKey)
    if (cached) return cached
    const coords = await resolveCoordsByCity(resolved.queryCity)
    lat = coords.lat
    lon = coords.lon
    cityName = coords.displayCity
  }

  const cached = _get(cacheKey)
  if (cached) return cached

  const { forecast, source } = await getForecastByCoords(lat, lon, safeDays)
  const result = { city: cityName, days: safeDays, forecast, availableDays: forecast.length, source }
  _set(cacheKey, result)
  return result
}

// ── Public: current conditions (for AI chat tool) ────────────────────────────
async function queryLiveWeather(city) {
  const resolved = resolveCityQuery(city)
  const coords = await resolveCoordsByCity(resolved.queryCity)
  if (QWEATHER_KEY) {
    const now = await fetchQWeatherNow(coords.lat, coords.lon)
    return `${coords.displayCity} 当前${now.weatherText}，气温 ${now.tempC}°C，湿度 ${now.humidity}%`
  }
  // Fallback: use first day of forecast
  const forecast = await fetchOpenMeteoByCoords(coords.lat, coords.lon, 1)
  const d = forecast[0]
  return `${coords.displayCity} ${d?.weather || ''}，气温 ${d?.minTempC ?? '--'}~${d?.maxTempC ?? '--'}°C`
}

// ── Public: IP → city + lat/lon ──────────────────────────────────────────────
async function queryCityByIp() {
  const plans = [
    {
      source: 'ip-api.com',
      url: 'http://ip-api.com/json/?lang=zh-CN&fields=status,message,city,lat,lon',
      read: (j) => ({ city: String(j?.city || '').trim(), lat: Number(j?.lat) || null, lon: Number(j?.lon) || null }),
      checkError: (j) => (j?.status === 'fail' ? String(j?.message || '定位失败') : ''),
    },
    {
      source: 'ipapi.co',
      url: 'https://ipapi.co/json/',
      read: (j) => ({ city: String(j?.city || '').trim(), lat: Number(j?.latitude) || null, lon: Number(j?.longitude) || null }),
      checkError: (j) => String(j?.error || '').trim(),
    },
  ]
  const errors = []
  for (const plan of plans) {
    try {
      const res = await fetch(plan.url, { headers: { 'User-Agent': 'even-dashboard/1.0' }, signal: AbortSignal.timeout(6000) })
      if (!res.ok) { errors.push(`${plan.source}: HTTP ${res.status}`); continue }
      const json = await res.json()
      const apiError = plan.checkError(json)
      if (apiError) { errors.push(`${plan.source}: ${apiError}`); continue }
      const { city, lat, lon } = plan.read(json)
      if (!city) { errors.push(`${plan.source}: 未返回城市`); continue }
      return { ok: true, city, lat, lon, source: plan.source }
    } catch (err) {
      errors.push(`${plan.source}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { ok: false, city: '', lat: null, lon: null, source: 'ip-api.com/ipapi.co', message: errors.join(' | ') || 'IP 定位失败' }
}

function formatRecentWeatherResult(result) {
  const rows = Array.isArray(result?.forecast) ? result.forecast : []
  if (!rows.length) return `${result?.city || WEATHER_DEFAULT_CITY} 暂无天气数据`
  const lines = rows.map((item) => {
    const minT = Number.isFinite(Number(item?.minTempC)) ? `${item.minTempC}°C` : '--'
    const maxT = Number.isFinite(Number(item?.maxTempC)) ? `${item.maxTempC}°C` : '--'
    const hum = Number.isFinite(Number(item?.humidity)) ? `${item.humidity}%` : '--'
    return `- ${item?.date || '--'} ${item?.weather || '未知'}，${minT} ~ ${maxT}，湿度 ${hum}`
  })
  return `${result.city} 最近 ${result.days} 天天气：\n${lines.join('\n')}`
}

module.exports = {
  WEATHER_DEFAULT_CITY,
  queryLiveWeather,
  queryRecentWeatherDays,
  formatRecentWeatherResult,
  queryCityByIp,
}
