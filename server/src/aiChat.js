const {
  queryRecentWeatherDays,
  createQueryWeatherCurrentTool,
  createQueryWeatherRecentTool,
  createQueryCityByIpTool,
  createListTodosTool,
  createAddTodoTool,
  createUpdateTodoTool,
  createDeleteTodoTool,
} = require('./tools')

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

  const weatherCurrentTool = createQueryWeatherCurrentTool(DynamicStructuredTool)
  const weatherRecentTool = createQueryWeatherRecentTool(DynamicStructuredTool)
  const cityByIpTool = createQueryCityByIpTool(DynamicStructuredTool)
  const listTodosTool = createListTodosTool(DynamicStructuredTool)
  const addTodoTool = createAddTodoTool(DynamicStructuredTool)
  const updateTodoTool = createUpdateTodoTool(DynamicStructuredTool)
  const removeTodoTool = createDeleteTodoTool(DynamicStructuredTool)

  const { apiKey, model, baseURL } = getModelConfig()
  const llm = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.3,
    configuration: baseURL ? { baseURL } : undefined,
  })

  const agent = createAgent({
    model: llm,
    tools: [
      weatherCurrentTool,
      weatherRecentTool,
      cityByIpTool,
      listTodosTool,
      addTodoTool,
      updateTodoTool,
      removeTodoTool,
    ],
    systemPrompt:
      '你是一个中文 AI 助手。你可以进行日常问答；如果用户询问天气，必须调用 query_weather_current 或 query_weather_recent 工具后再回答。' +
      '如果用户问“我这里/我当前”的天气，先调用 query_city_by_ip，再调用天气工具。' +
      '如果用户要添加、修改、完成、删除或查看待办事项，必须调用对应待办工具后再回答。' +
      '天气类回复统一使用如下风格：\n' +
      '1) 第一行写“{城市}现在的天气情况如下：”\n' +
      '2) 空一行后用 Markdown 列表输出三项：天气状况、气温、湿度（可带合适 emoji）\n' +
      '3) 最后再给一句简短出行建议，语气自然。\n' +
      '如果工具返回“暂无天气数据”，请直接礼貌告知并建议用户换一个更完整的城市名。' +
      '待办类回复请简短确认结果，并在必要时提示用户待办 id 以便后续修改。',
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
