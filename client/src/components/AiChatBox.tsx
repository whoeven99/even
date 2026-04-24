import { useState } from 'react'
import type { FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { requestWithFetch } from '../services/http'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ChatApiResponse = {
  ok: boolean
  reply?: string
  message?: string
}

export function AiChatBox() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '你好，我是 AI 助手。你可以问我天气，比如：深圳今天天气怎么样？',
    },
  ])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = input.trim()
    if (!content || loading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content }])
    setLoading(true)

    try {
      const data = await requestWithFetch<ChatApiResponse>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: content }),
      })

      if (!data.ok || !data.reply) {
        throw new Error(data.message || 'AI 未返回有效内容')
      }

      const reply = data.reply
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `请求失败：${(error as Error).message}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-meta muted">已连接 LangChain 天气助手（Tool: query_weather）</div>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`chat-message ${message.role === 'user' ? 'chat-user' : 'chat-assistant'}`}
          >
            {message.role === 'assistant' ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            ) : (
              message.content
            )}
          </div>
        ))}
        {loading && <div className="chat-message chat-assistant chat-typing">AI 正在思考...</div>}
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="请输入内容，比如：北京天气"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          {loading ? '发送中...' : '发送'}
        </button>
      </form>
    </div>
  )
}
