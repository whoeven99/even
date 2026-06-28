const {
  queryRecentWeatherDays,
  createQueryWeatherCurrentTool,
  createQueryWeatherRecentTool,
  createQueryCityByIpTool,
  createListTodosTool,
  createAddTodoTool,
  createUpdateTodoTool,
  createDeleteTodoTool,
  createGetAssetsTool,
  createAddAssetTool,
  createUpdateAssetTool,
  createDeleteAssetTool,
  createGetSubscriptionsTool,
  createAddSubscriptionTool,
  createUpdateSubscriptionTool,
  createDeleteSubscriptionTool,
  createListNotesTool,
  createGetNoteTool,
  createSearchNotesTool,
  createAddNoteTool,
  createUpdateNoteTool,
  createDeleteNoteTool,
  createListBillMonthsTool,
  createAnalyzeBillMonthTool,
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

  // 资产负债
  const getAssetsTool = createGetAssetsTool(DynamicStructuredTool)
  const addAssetTool = createAddAssetTool(DynamicStructuredTool)
  const updateAssetTool = createUpdateAssetTool(DynamicStructuredTool)
  const deleteAssetTool = createDeleteAssetTool(DynamicStructuredTool)
  // 固定支出
  const getSubsTool = createGetSubscriptionsTool(DynamicStructuredTool)
  const addSubsTool = createAddSubscriptionTool(DynamicStructuredTool)
  const updateSubsTool = createUpdateSubscriptionTool(DynamicStructuredTool)
  const deleteSubsTool = createDeleteSubscriptionTool(DynamicStructuredTool)
  // 备忘录
  const listNotesTool = createListNotesTool(DynamicStructuredTool)
  const getNoteTool = createGetNoteTool(DynamicStructuredTool)
  const searchNotesTool = createSearchNotesTool(DynamicStructuredTool)
  const addNoteTool = createAddNoteTool(DynamicStructuredTool)
  const updateNoteTool = createUpdateNoteTool(DynamicStructuredTool)
  const deleteNoteTool = createDeleteNoteTool(DynamicStructuredTool)
  // 微信账单
  const listBillMonthsTool = createListBillMonthsTool(DynamicStructuredTool)
  const analyzeBillMonthTool = createAnalyzeBillMonthTool(DynamicStructuredTool)

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
      getAssetsTool,
      addAssetTool,
      updateAssetTool,
      deleteAssetTool,
      getSubsTool,
      addSubsTool,
      updateSubsTool,
      deleteSubsTool,
      listNotesTool,
      getNoteTool,
      searchNotesTool,
      addNoteTool,
      updateNoteTool,
      deleteNoteTool,
      listBillMonthsTool,
      analyzeBillMonthTool,
    ],
    systemPrompt:
      '你是 SkyBoard 个人仪表盘的智能助理，是一个可以调用工具的 Agent。' +
      '仪表盘的所有功能都以工具形式提供给你，你可以读取数据、分析数据，并在用户授意下写入数据。\n\n' +
      '你能操作的领域与对应工具：\n' +
      '- 天气：query_weather_current / query_weather_recent；问“我这里/当前”天气时先 query_city_by_ip。\n' +
      '- 待办：list_todos / add_todo / update_todo / delete_todo。\n' +
      '- 资产负债（净资产分析）：get_assets / add_asset / update_asset / delete_asset。负债用负数金额。\n' +
      '- 固定支出（订阅账单）：get_subscriptions / add_subscription / update_subscription / delete_subscription。\n' +
      '- 备忘录：list_notes / get_note / search_notes（语义搜索）/ add_note / update_note / delete_note。\n' +
      '- 微信账单分析：先 list_bill_months 拿 stageId，再 analyze_bill_month 分析某月消费。\n\n' +
      '工作原则：\n' +
      '1) 任何涉及真实数据的问答，必须先调用对应的读取工具获取最新数据，再基于结果回答，不要凭空编造。\n' +
      '2) 需要修改/新增/删除时，先用读取工具确认目标与 id，再调用写入工具；删除等不可逆操作前先向用户确认。\n' +
      '3) 做数据分析时（如“这个月花得多吗”“我的净资产健康吗”），调用相关工具取数后给出有依据的简短结论与建议。\n' +
      '4) 回复使用简体中文与 Markdown，简洁清晰，可适当使用 emoji。\n\n' +
      '天气类回复风格：第一行“{城市}现在的天气情况如下：”，空一行后用 Markdown 列表给出天气状况、气温、湿度，最后一句出行建议。' +
      '若工具返回“暂无天气数据”，礼貌告知并建议换更完整的城市名。',
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
