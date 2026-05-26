function getModelConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY
  const model = process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || 'deepseek-chat'
  const baseURL = process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || undefined
  return { apiKey, model, baseURL }
}

async function aiSearchNotes(notes, query) {
  const { ChatOpenAI } = await import('@langchain/openai')
  const { apiKey, model, baseURL } = getModelConfig()
  const llm = new ChatOpenAI({
    apiKey,
    model,
    temperature: 0,
    configuration: baseURL ? { baseURL } : undefined,
  })

  const noteList = notes
    .slice(0, 300)
    .map((n, i) => {
      const preview = n.content.slice(0, 250) + (n.content.length > 250 ? '…' : '')
      return `[${i + 1}] id="${n.id}"\n标题: ${n.title || '（无标题）'}\n内容: ${preview}`
    })
    .join('\n\n')

  const prompt = `你是一个个人备忘录语义搜索助手。以下是全部笔记：

${noteList}

用户搜索：「${query}」

找出与搜索意图语义相关的笔记。不需要精确匹配词语，理解用户的意图即可。
例如搜索「公积金账号」可以匹配标题含「社保」或内容含「公积金」的笔记。

返回 JSON，格式如下，只包含相关条目，按相关度排序：
{"results":[{"id":"条目id","reason":"一句话说明为何相关，10字以内"}]}

若无相关条目返回 {"results":[]}
只输出 JSON，不要有其他内容。`

  const response = await llm.invoke(prompt)
  const text = typeof response === 'string' ? response : String(response?.content || '')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { results: [] }
  try {
    return JSON.parse(match[0])
  } catch {
    return { results: [] }
  }
}

module.exports = { aiSearchNotes }
