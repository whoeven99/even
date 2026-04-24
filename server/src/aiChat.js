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

async function queryLiveWeather(city) {
  const resolved = resolveCityQuery(city)
  if (!resolved || !resolved.queryCity) {
    throw new Error('城市名不能为空')
  }
  const weatherUrl = `https://wttr.in/${encodeURIComponent(resolved.queryCity)}?format=j1`
  const weatherResponse = await fetch(weatherUrl)
  if (!weatherResponse.ok) {
    throw new Error(`天气查询失败（HTTP ${weatherResponse.status}）`)
  }

  const weatherData = await weatherResponse.json()
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
}
