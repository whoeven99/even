// In-memory weather cache — avoids hitting Open-Meteo rate limits on repeated loads
const _weatherCache = new Map()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

function _getCached(key) {
  const entry = _weatherCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    _weatherCache.delete(key)
    return null
  }
  return entry.data
}

function _setCache(key, data) {
  _weatherCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

const CITY_ALIASES = {
  北京市: '北京',
  帝都: '北京',
  魔都: '上海',
  上海市: '上海',
  广州市: '广州',
  羊城: '广州',
  深圳市: '深圳',
  杭州市: '杭州',
  余杭: '杭州',
  天津市: '天津',
  重庆市: '重庆',
  山城: '重庆',
  成都市: '成都',
  蓉城: '成都',
  武汉市: '武汉',
  江城: '武汉',
  西安市: '西安',
  古都西安: '西安',
  南京市: '南京',
  金陵: '南京',
  苏州市: '苏州',
  姑苏: '苏州',
  宁波市: '宁波',
  青岛市: '青岛',
  济南市: '济南',
  郑州市: '郑州',
  长沙市: '长沙',
  星城: '长沙',
  福州市: '福州',
  厦门市: '厦门',
  鹭岛: '厦门',
  昆明市: '昆明',
  春城: '昆明',
  乌鲁木齐市: '乌鲁木齐',
  哈尔滨市: '哈尔滨',
  冰城: '哈尔滨',
  石家庄市: '石家庄',
  呼和浩特市: '呼和浩特',
  南宁市: '南宁',
  海口市: '海口',
  三亚市: '三亚',
}

const WEATHER_DEFAULT_CITY = process.env.DEFAULT_WEATHER_CITY || '杭州'

function sanitizeCityInput(input) {
  return String(input || '')
    .replace(/[，。！？、,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCityFromWeatherQuery(input) {
  const text = sanitizeCityInput(input)
  if (!text) return ''

  const directAlias = CITY_ALIASES[text]
  if (directAlias) return directAlias

  const candidate = text
    .replace(/(帮我|麻烦|请|想问|问下|查下|查一?下|看下|看一?下|告诉我)/g, ' ')
    .replace(/(今天|明天|后天|现在|近期|最近|这几天|这两天)/g, ' ')
    .replace(/(天气|气温|温度|湿度|风力|风速|降雨|降水|预报|空气质量|体感)/g, ' ')
    .replace(/(怎么样|如何|多少|几度|冷不冷|热不热|吗|呢)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!candidate) return ''

  const alias = CITY_ALIASES[candidate]
  if (alias) return alias

  const cityMatch = candidate.match(
    /([\u4e00-\u9fa5]{2,}(?:市|自治州|地区|盟|特别行政区|县|区|旗)?)/,
  )
  if (!cityMatch) return ''

  const rawCity = cityMatch[1]
  const normalized = rawCity
    .replace(/特别行政区$/, '')
    .replace(/自治区$/, '')
    .replace(/自治州$/, '')
    .replace(/地区$/, '')
    .replace(/盟$/, '')
    .replace(/市$/, '')
    .trim()

  if (!normalized) return ''
  return CITY_ALIASES[normalized] || normalized
}

function resolveCityQuery(inputCity) {
  const raw = sanitizeCityInput(inputCity)
  const inferred = extractCityFromWeatherQuery(raw)
  const city = inferred || raw
  if (!city) {
    return { queryCity: WEATHER_DEFAULT_CITY, displayCity: WEATHER_DEFAULT_CITY }
  }
  const aliased = CITY_ALIASES[city]
  if (aliased) {
    return { queryCity: aliased, displayCity: aliased }
  }
  return { queryCity: city, displayCity: city }
}

function weatherCodeToText(code) {
  const map = {
    0: '晴',
    1: '晴间多云',
    2: '多云',
    3: '阴',
    45: '雾',
    48: '雾凇',
    51: '小毛雨',
    53: '毛毛雨',
    55: '强毛毛雨',
    56: '冻毛毛雨',
    57: '强冻毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '强冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '冰粒',
    80: '小阵雨',
    81: '中阵雨',
    82: '强阵雨',
    85: '小阵雪',
    86: '强阵雪',
    95: '雷阵雨',
    96: '雷阵雨夹小冰雹',
    99: '雷阵雨夹大冰雹',
  }
  return map[code] || '未知'
}

function normalizeWeatherLabel(text) {
  const value = String(text || '').trim()
  if (!value) return '未知天气'
  const lower = value.toLowerCase()

  if (lower.includes('thunder') || value.includes('雷') || value.includes('雷暴')) return '雷雨天'
  if (lower.includes('snow') || lower.includes('sleet') || value.includes('雪') || value.includes('冰雹')) return '雪天'
  if (lower.includes('rain') || lower.includes('drizzle') || lower.includes('shower') || value.includes('雨')) return '雨天'
  if (lower.includes('cloud') || lower.includes('overcast') || lower.includes('fog') || lower.includes('mist') || value.includes('阴') || value.includes('云') || value.includes('雾')) return '阴天'
  if (lower.includes('sun') || lower.includes('clear') || value.includes('晴')) return '晴天'
  return `${value}天`
}

function parseForecastData(daily, safeDays) {
  const times = Array.isArray(daily?.time) ? daily.time : []
  const maxTemps = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max : []
  const minTemps = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min : []
  const humidities = Array.isArray(daily?.relative_humidity_2m_mean) ? daily.relative_humidity_2m_mean : []
  const weatherCodes = Array.isArray(daily?.weather_code) ? daily.weather_code : []

  if (times.length === 0) throw new Error('天气服务未返回预报数据')

  return times.slice(0, safeDays).map((date, index) => {
    const maxTemp = Number(maxTemps[index])
    const minTemp = Number(minTemps[index])
    const humidity = Number(humidities[index])
    const code = Number(weatherCodes[index])
    return {
      date: String(date || ''),
      weather: normalizeWeatherLabel(weatherCodeToText(code)),
      maxTempC: Number.isFinite(maxTemp) ? Math.round(maxTemp) : null,
      minTempC: Number.isFinite(minTemp) ? Math.round(minTemp) : null,
      humidity: Number.isFinite(humidity) ? Math.round(humidity) : null,
    }
  })
}

// Fetch weather by lat/lon directly — no geocoding needed
async function fetchWeatherByCoords(lat, lon, days) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 3))
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&timezone=auto` +
    `&forecast_days=${safeDays}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean` +
    `&current=temperature_2m,relative_humidity_2m,weather_code`

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Open-Meteo 请求失败（HTTP ${response.status}）`)
  return response.json()
}

// Fetch weather by city name — geocodes first, then fetches
async function fetchWeatherByCity(city, days) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 3))
  const resolved = resolveCityQuery(city)
  if (!resolved?.queryCity) throw new Error('城市名不能为空')

  const geoUrl =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(resolved.queryCity)}&count=1&language=zh&format=json`

  const geoResponse = await fetch(geoUrl, { signal: AbortSignal.timeout(8000) })
  if (!geoResponse.ok) throw new Error(`地理编码失败（HTTP ${geoResponse.status}）`)

  const geoData = await geoResponse.json()
  const first = geoData?.results?.[0]
  if (!first || !Number.isFinite(first.latitude) || !Number.isFinite(first.longitude)) {
    throw new Error(`未找到城市「${resolved.queryCity}」的位置信息`)
  }

  const forecastData = await fetchWeatherByCoords(first.latitude, first.longitude, safeDays)
  return { forecastData, resolved, lat: first.latitude, lon: first.longitude }
}

// Main: query recent N-day forecast. Accepts city string or { city, lat, lon }
async function queryRecentWeatherDays(cityOrOptions, days = 3) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 3))

  // If lat/lon provided, skip geocoding entirely
  if (
    typeof cityOrOptions === 'object' &&
    cityOrOptions !== null &&
    Number.isFinite(Number(cityOrOptions.lat)) &&
    Number.isFinite(Number(cityOrOptions.lon))
  ) {
    const { lat, lon } = cityOrOptions
    const cityName = String(cityOrOptions.city || WEATHER_DEFAULT_CITY)
    // Round coords to 1 decimal to group nearby requests under the same cache key
    const cacheKey = `coords:${(Math.round(Number(lat) * 10) / 10).toFixed(1)},${(Math.round(Number(lon) * 10) / 10).toFixed(1)},${safeDays}`
    const cached = _getCached(cacheKey)
    if (cached) return cached

    const forecastData = await fetchWeatherByCoords(Number(lat), Number(lon), safeDays)
    const forecast = parseForecastData(forecastData.daily, safeDays)
    const result = {
      city: cityName,
      days: safeDays,
      forecast,
      availableDays: forecast.length,
      source: 'open-meteo',
    }
    _setCache(cacheKey, result)
    return result
  }

  // City name path — geocode first
  const city = typeof cityOrOptions === 'string' ? cityOrOptions : String(cityOrOptions || WEATHER_DEFAULT_CITY)
  const resolved = resolveCityQuery(city)
  const cacheKey = `city:${resolved.queryCity},${safeDays}`
  const cached = _getCached(cacheKey)
  if (cached) return cached

  const { forecastData } = await fetchWeatherByCity(city, safeDays)
  const forecast = parseForecastData(forecastData.daily, safeDays)
  const result = {
    city: resolved.displayCity,
    days: safeDays,
    forecast,
    availableDays: forecast.length,
    source: 'open-meteo',
  }
  _setCache(cacheKey, result)
  return result
}

// For AI chat tool: current conditions
async function queryLiveWeather(city) {
  const resolved = resolveCityQuery(city)
  const { forecastData } = await fetchWeatherByCity(resolved.queryCity, 1)

  const current = forecastData?.current
  if (!current) throw new Error('天气服务未返回实时数据')

  const tempC = Number(current.temperature_2m)
  const humidity = Number(current.relative_humidity_2m)
  const weatherText = weatherCodeToText(Number(current.weather_code))
  if (!Number.isFinite(tempC)) throw new Error('天气服务返回的温度字段无效')

  return `${resolved.displayCity} 当前${normalizeWeatherLabel(weatherText)}，气温 ${Math.round(tempC)}°C，湿度 ${Math.round(humidity)}%`
}

// IP → city + lat/lon
async function queryCityByIp() {
  const plans = [
    {
      source: 'ip-api.com',
      url: 'http://ip-api.com/json/?lang=zh-CN&fields=status,message,city,lat,lon',
      read: (json) => ({
        city: String(json?.city || '').trim(),
        lat: Number(json?.lat) || null,
        lon: Number(json?.lon) || null,
      }),
      checkError: (json) => (json?.status === 'fail' ? String(json?.message || '定位失败') : ''),
    },
    {
      source: 'ipapi.co',
      url: 'https://ipapi.co/json/',
      read: (json) => ({
        city: String(json?.city || '').trim(),
        lat: Number(json?.latitude) || null,
        lon: Number(json?.longitude) || null,
      }),
      checkError: (json) => String(json?.error || '').trim(),
    },
  ]

  const errors = []
  for (const plan of plans) {
    try {
      const response = await fetch(plan.url, {
        headers: { 'User-Agent': 'even-dashboard/1.0' },
        signal: AbortSignal.timeout(6000),
      })
      if (!response.ok) {
        errors.push(`${plan.source}: HTTP ${response.status}`)
        continue
      }
      const json = await response.json()
      const apiError = plan.checkError(json)
      if (apiError) {
        errors.push(`${plan.source}: ${apiError}`)
        continue
      }
      const { city, lat, lon } = plan.read(json)
      if (!city) {
        errors.push(`${plan.source}: 未返回城市`)
        continue
      }
      return { ok: true, city, lat, lon, source: plan.source }
    } catch (error) {
      errors.push(`${plan.source}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return {
    ok: false,
    city: '',
    lat: null,
    lon: null,
    source: 'ip-api.com/ipapi.co',
    message: errors.join(' | ') || 'IP 定位失败',
  }
}

function formatRecentWeatherResult(result) {
  const rows = Array.isArray(result?.forecast) ? result.forecast : []
  if (!rows.length) return `${result?.city || WEATHER_DEFAULT_CITY} 暂无天气数据`
  const lines = rows.map((item) => {
    const date = String(item?.date || '').trim() || '--'
    const weather = String(item?.weather || '未知')
    const minTemp = Number.isFinite(Number(item?.minTempC)) ? `${item.minTempC}°C` : '--'
    const maxTemp = Number.isFinite(Number(item?.maxTempC)) ? `${item.maxTempC}°C` : '--'
    const humidity = Number.isFinite(Number(item?.humidity)) ? `${item.humidity}%` : '--'
    return `- ${date} ${weather}，${minTemp} ~ ${maxTemp}，湿度 ${humidity}`
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
