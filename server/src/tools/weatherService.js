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
  const normalized = m[1]
    .replace(/特别行政区$|自治区$|自治州$|地区$|盟$|市$/, '').trim()
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

// ── Weather code / label helpers ─────────────────────────────────────────────
function weatherCodeToText(code) {
  const map = {
    0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
    45: '雾', 48: '雾凇',
    51: '小毛雨', 53: '毛毛雨', 55: '强毛毛雨', 56: '冻毛毛雨', 57: '强冻毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '冰粒',
    80: '小阵雨', 81: '中阵雨', 82: '强阵雨', 85: '小阵雪', 86: '强阵雪',
    95: '雷阵雨', 96: '雷阵雨夹小冰雹', 99: '雷阵雨夹大冰雹',
  }
  return map[code] || '未知'
}

function normalizeWeatherLabel(text) {
  const v = String(text || '').trim()
  if (!v) return '未知天气'
  const l = v.toLowerCase()
  if (l.includes('thunder') || v.includes('雷')) return '雷雨天'
  if (l.includes('snow') || l.includes('sleet') || v.includes('雪') || v.includes('冰雹')) return '雪天'
  if (l.includes('rain') || l.includes('drizzle') || l.includes('shower') || v.includes('雨')) return '雨天'
  if (l.includes('cloud') || l.includes('overcast') || l.includes('fog') || l.includes('mist') || v.includes('阴') || v.includes('云') || v.includes('雾')) return '阴天'
  if (l.includes('sun') || l.includes('clear') || v.includes('晴')) return '晴天'
  return `${v}天`
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function parseOpenMeteoForecast(daily, safeDays) {
  const times = Array.isArray(daily?.time) ? daily.time : []
  if (times.length === 0) throw new Error('天气服务未返回预报数据')
  const maxTemps = daily?.temperature_2m_max || []
  const minTemps = daily?.temperature_2m_min || []
  const humidities = daily?.relative_humidity_2m_mean || []
  const codes = daily?.weather_code || []
  return times.slice(0, safeDays).map((date, i) => {
    const maxT = Number(maxTemps[i]), minT = Number(minTemps[i]), hum = Number(humidities[i])
    return {
      date: String(date || ''),
      weather: normalizeWeatherLabel(weatherCodeToText(Number(codes[i]))),
      maxTempC: Number.isFinite(maxT) ? Math.round(maxT) : null,
      minTempC: Number.isFinite(minT) ? Math.round(minT) : null,
      humidity: Number.isFinite(hum) ? Math.round(hum) : null,
    }
  })
}

function parseWttrForecast(data, safeDays) {
  const rows = Array.isArray(data?.weather) ? data.weather.slice(0, safeDays) : []
  if (rows.length === 0) throw new Error('天气服务未返回预报数据')
  return rows.map((item) => {
    const maxT = Number(item?.maxtempC), minT = Number(item?.mintempC)
    const hum = Number(item?.hourly?.[4]?.humidity ?? item?.hourly?.[0]?.humidity)
    const desc = item?.hourly?.[4]?.weatherDesc?.[0]?.value || item?.hourly?.[0]?.weatherDesc?.[0]?.value || ''
    return {
      date: String(item?.date || ''),
      weather: normalizeWeatherLabel(desc),
      maxTempC: Number.isFinite(maxT) ? Math.round(maxT) : null,
      minTempC: Number.isFinite(minT) ? Math.round(minT) : null,
      humidity: Number.isFinite(hum) ? Math.round(hum) : null,
    }
  })
}

// ── Core fetch: Open-Meteo primary, wttr.in fallback ─────────────────────────
async function fetchForecastByCoords(lat, lon, safeDays) {
  // Primary: Open-Meteo
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&timezone=auto&forecast_days=${safeDays}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean` +
      `&current=temperature_2m,relative_humidity_2m,weather_code`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const data = await res.json()
      const forecast = parseOpenMeteoForecast(data.daily, safeDays)
      const c = data.current
      const current = c ? {
        tempC: Math.round(Number(c.temperature_2m)),
        humidity: Math.round(Number(c.relative_humidity_2m)),
        weatherText: weatherCodeToText(Number(c.weather_code)),
      } : null
      return { forecast, current, source: 'open-meteo' }
    }
    // fall through to wttr.in on any non-ok status (including 429)
  } catch {
    // network error — fall through
  }

  // Fallback: wttr.in (accepts "lat,lon")
  const url = `https://wttr.in/${lat},${lon}?format=j1&num_of_days=${safeDays}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`天气查询失败（HTTP ${res.status}）`)
  const data = await res.json()
  const forecast = parseWttrForecast(data, safeDays)
  const cc = data.current_condition?.[0]
  const current = cc ? {
    tempC: Math.round(Number(cc.temp_C)),
    humidity: Math.round(Number(cc.humidity)),
    weatherText: cc.weatherDesc?.[0]?.value || '未知',
  } : null
  return { forecast, current, source: 'wttr' }
}

async function resolveCoordsByCity(city) {
  const resolved = resolveCityQuery(city)
  if (!resolved?.queryCity) throw new Error('城市名不能为空')
  const geoUrl =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(resolved.queryCity)}&count=1&language=zh&format=json`
  const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) })
  if (!geoRes.ok) throw new Error(`地理编码失败（HTTP ${geoRes.status}）`)
  const geoData = await geoRes.json()
  const first = geoData?.results?.[0]
  if (!first || !Number.isFinite(first.latitude) || !Number.isFinite(first.longitude)) {
    throw new Error(`未找到城市「${resolved.queryCity}」的位置信息`)
  }
  return { resolved, lat: first.latitude, lon: first.longitude }
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
    // Round to 1 decimal (~10 km) so nearby requests share a cache entry
    cacheKey = `c:${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)},${safeDays}`
  } else {
    const city = typeof cityOrOptions === 'string' ? cityOrOptions : String(cityOrOptions || WEATHER_DEFAULT_CITY)
    const resolved = resolveCityQuery(city)
    cacheKey = `n:${resolved.queryCity},${safeDays}`
    cityName = resolved.displayCity
    // Need to geocode — check cache first before the extra network call
    const cached = _get(cacheKey)
    if (cached) return cached
    const coords = await resolveCoordsByCity(city)
    lat = coords.lat
    lon = coords.lon
    cityName = coords.resolved.displayCity
  }

  const cached = _get(cacheKey)
  if (cached) return cached

  const { forecast } = await fetchForecastByCoords(lat, lon, safeDays)
  const result = { city: cityName, days: safeDays, forecast, availableDays: forecast.length, source: 'open-meteo' }
  _set(cacheKey, result)
  return result
}

// ── Public: current conditions (for AI chat tool) ────────────────────────────
async function queryLiveWeather(city) {
  const resolved = resolveCityQuery(city)
  const { lat, lon } = await resolveCoordsByCity(resolved.queryCity)
  const { current } = await fetchForecastByCoords(lat, lon, 1)
  if (!current) throw new Error('天气服务未返回实时数据')
  return `${resolved.displayCity} 当前${normalizeWeatherLabel(current.weatherText)}，气温 ${current.tempC}°C，湿度 ${current.humidity}%`
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
    const date = String(item?.date || '').trim() || '--'
    const minT = Number.isFinite(Number(item?.minTempC)) ? `${item.minTempC}°C` : '--'
    const maxT = Number.isFinite(Number(item?.maxTempC)) ? `${item.maxTempC}°C` : '--'
    const hum = Number.isFinite(Number(item?.humidity)) ? `${item.humidity}%` : '--'
    return `- ${date} ${item?.weather || '未知'}，${minT} ~ ${maxT}，湿度 ${hum}`
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
