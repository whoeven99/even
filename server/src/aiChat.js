const { z } = require('zod')

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

function resolveCityQuery(inputCity) {
  const raw = inputCity.trim()
  if (!raw) return raw
  const aliased = CITY_ALIASES[raw]
  if (aliased) {
    return { queryCity: aliased, displayCity: raw }
  }
  // 不对用户输入做裁剪改写，确保“输入什么就查询什么”。
  return { queryCity: raw, displayCity: raw }
}

async function fetchWeatherData(city, days = 3) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 3))
  const resolved = resolveCityQuery(city)
  if (!resolved || !resolved.queryCity) {
    throw new Error('城市名不能为空')
  }
  const weatherUrl = `https://wttr.in/${encodeURIComponent(resolved.queryCity)}?format=j1&num_of_days=${safeDays}`
  const weatherResponse = await fetch(weatherUrl)
  if (!weatherResponse.ok) {
    throw new Error(`天气查询失败（HTTP ${weatherResponse.status}）`)
  }

  const weatherData = await weatherResponse.json()
  return { resolved, weatherData }
}

async function queryLiveWeather(city) {
  const { resolved, weatherData } = await fetchWeatherData(city, 1)
  const current = weatherData?.current_condition?.[0]
  if (!current) {
    throw new Error('天气服务未返回实时数据')
  }

  const weatherText = current?.weatherDesc?.[0]?.value || '未知'
  const tempC = Number(current.temp_C)
  const humidity = Number(current.humidity)
  if (!Number.isFinite(tempC)) {
    throw new Error('天气服务返回的温度字段无效')
  }
  const normalizedTemp = Math.round(tempC)
  const normalizedHumidity = Number.isFinite(humidity) ? Math.round(humidity) : 0

  return `${resolved.displayCity} 当前${weatherText}，气温 ${normalizedTemp}°C，湿度 ${normalizedHumidity}%`
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

  if (
    lower.includes('thunder') ||
    value.includes('雷') ||
    value.includes('雷暴')
  ) {
    return '雷雨天'
  }
  if (
    lower.includes('snow') ||
    lower.includes('sleet') ||
    value.includes('雪') ||
    value.includes('冰雹')
  ) {
    return '雪天'
  }
  if (
    lower.includes('rain') ||
    lower.includes('drizzle') ||
    lower.includes('shower') ||
    value.includes('雨')
  ) {
    return '雨天'
  }
  if (
    lower.includes('cloud') ||
    lower.includes('overcast') ||
    lower.includes('fog') ||
    lower.includes('mist') ||
    value.includes('阴') ||
    value.includes('云') ||
    value.includes('雾')
  ) {
    return '阴天'
  }
  if (
    lower.includes('sun') ||
    lower.includes('clear') ||
    value.includes('晴')
  ) {
    return '晴天'
  }

  return `${value}天`
}

async function queryRecentWeatherDaysByOpenMeteo(city, days) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 5))
  const resolved = resolveCityQuery(city)
  if (!resolved || !resolved.queryCity) {
    throw new Error('城市名不能为空')
  }

  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(resolved.queryCity)}&count=1&language=zh&format=json`
  const geoResponse = await fetch(geoUrl)
  if (!geoResponse.ok) {
    throw new Error(`地理编码失败（HTTP ${geoResponse.status}）`)
  }
  const geoData = await geoResponse.json()
  const first = geoData?.results?.[0]
  if (!first || !Number.isFinite(first.latitude) || !Number.isFinite(first.longitude)) {
    throw new Error('未找到该城市的经纬度信息')
  }

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}` +
    `&longitude=${first.longitude}` +
    '&timezone=Asia%2FShanghai' +
    `&forecast_days=${safeDays}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean'
  const forecastResponse = await fetch(forecastUrl)
  if (!forecastResponse.ok) {
    throw new Error(`天气预报查询失败（HTTP ${forecastResponse.status}）`)
  }
  const forecastData = await forecastResponse.json()
  const daily = forecastData?.daily
  const times = Array.isArray(daily?.time) ? daily.time : []
  const maxTemps = Array.isArray(daily?.temperature_2m_max)
    ? daily.temperature_2m_max
    : []
  const minTemps = Array.isArray(daily?.temperature_2m_min)
    ? daily.temperature_2m_min
    : []
  const humidities = Array.isArray(daily?.relative_humidity_2m_mean)
    ? daily.relative_humidity_2m_mean
    : []
  const weatherCodes = Array.isArray(daily?.weather_code) ? daily.weather_code : []

  if (times.length === 0) {
    throw new Error('天气服务未返回天气预报数据')
  }

  const forecast = times.slice(0, safeDays).map((date, index) => {
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

  return {
    city: resolved.displayCity,
    days: safeDays,
    forecast,
    source: 'open-meteo',
  }
}

async function queryRecentWeatherDays(city, days = 5) {
  const safeDays = Math.max(1, Math.min(7, Number(days) || 5))
  let resolved = null
  let rows = []
  try {
    const result = await fetchWeatherData(city, safeDays)
    resolved = result.resolved
    rows = Array.isArray(result.weatherData?.weather)
      ? result.weatherData.weather.slice(0, safeDays)
      : []
  } catch (_error) {
    rows = []
  }

  if (rows.length < safeDays) {
    const fallback = await queryRecentWeatherDaysByOpenMeteo(city, safeDays)
    return {
      ...fallback,
      availableDays: fallback.forecast.length,
    }
  }

  const forecast = rows.map((item) => {
    const date = String(item?.date || '')
    const maxTemp = Number(item?.maxtempC)
    const minTemp = Number(item?.mintempC)
    const avgHumidity = Number(item?.hourly?.[0]?.humidity)
    const weatherText =
      item?.hourly?.[0]?.weatherDesc?.[0]?.value ||
      item?.hourly?.[4]?.weatherDesc?.[0]?.value ||
      '未知'
    return {
      date,
      weather: normalizeWeatherLabel(weatherText),
      maxTempC: Number.isFinite(maxTemp) ? Math.round(maxTemp) : null,
      minTempC: Number.isFinite(minTemp) ? Math.round(minTemp) : null,
      humidity: Number.isFinite(avgHumidity) ? Math.round(avgHumidity) : null,
    }
  })

  return {
    city: resolved?.displayCity || city,
    days: safeDays,
    forecast,
    source: 'wttr',
    availableDays: forecast.length,
  }
}

let runtimePromise = null

function getModelConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY
  const model =
    process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || 'deepseek-chat'
  const baseURL =
    process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || undefined

  return { apiKey, model, baseURL }
}

async function createRuntime() {
  const [{ ChatOpenAI }, { DynamicStructuredTool, createAgent }] =
    await Promise.all([
      import('@langchain/openai'),
      import('langchain'),
    ])

  const weatherTool = new DynamicStructuredTool({
    name: 'query_weather',
    description:
      '查询某个城市的天气，返回天气、温度和湿度。遇到天气问题必须优先调用该工具。',
    schema: z.object({
      city: z.string().describe('要查询天气的城市名称，例如 北京、上海'),
    }),
    func: async ({ city }) => {
      return queryLiveWeather(city)
    },
  })

  const { apiKey, model, baseURL } = getModelConfig()
  const llm = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.3,
    configuration: baseURL ? { baseURL } : undefined,
  })

  const agent = createAgent({
    model: llm,
    tools: [weatherTool],
    systemPrompt:
      '你是一个中文 AI 助手。你可以进行日常问答；如果用户询问天气，必须调用 query_weather 工具后再回答。' +
      '天气类回复统一使用如下风格：\n' +
      '1) 第一行写“{城市}现在的天气情况如下：”\n' +
      '2) 空一行后用 Markdown 列表输出三项：天气状况、气温、湿度（可带合适 emoji）\n' +
      '3) 最后再给一句简短出行建议，语气自然。\n' +
      '如果工具返回“暂无天气数据”，请直接礼貌告知并建议用户换一个更完整的城市名。',
  })

  return { agent }
}

function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = createRuntime()
  }
  return runtimePromise
}

async function chatWithAi(input) {
  const { apiKey } = getModelConfig()
  if (!apiKey) {
    throw new Error(
      '缺少 API Key，请配置 DEEPSEEK_API_KEY（或兼容的 OPENAI_API_KEY）。',
    )
  }

  const { agent } = await getRuntime()
  const result = await agent.invoke({
    messages: [{ role: 'user', content: input }],
  })
  const lastMessage = result?.messages?.[result.messages.length - 1]
  const content = lastMessage?.content
  if (typeof content === 'string' && content.trim()) {
    return content
  }

  if (Array.isArray(content)) {
    const text = content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'text' in item) {
          return String(item.text || '')
        }
        return ''
      })
      .join('\n')
      .trim()
    if (text) return text
  }

  throw new Error('AI 未返回可解析的文本内容')
}

module.exports = {
  chatWithAi,
  queryRecentWeatherDays,
}
