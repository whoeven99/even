import { useEffect, useRef, useState } from 'react'
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
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '你好，我可以帮你做两类事：\n\n' +
        '查天气\n' +
        '- 深圳今天天气\n' +
        '- 我这里现在天气怎么样\n' +
        '- 上海未来 3 天天气\n\n' +
        '管待办（自动保存）\n' +
        '- 添加待办：明天交周报\n' +
        '- 查看我的待办\n' +
        '- 把“明天交周报”标记完成\n' +
        '- 删除“明天交周报”',
    },
  ])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, loading])

  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus()
    }
  }, [loading])

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
      window.dispatchEvent(new CustomEvent('todos:changed'))
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
      <div className="chat-meta muted">
        已连接 LangChain Agent（Tools: 天气、IP 定位、待办管理）
      </div>
      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`chat-message ${message.role === 'user' ? 'chat-user' : 'chat-assistant'}`}
          >
            <div className="chat-message-head">{message.role === 'assistant' ? 'AI' : '你'}</div>
            <div className="chat-message-body">
              {message.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              ) : (
                message.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-message chat-assistant chat-typing">
            <div className="chat-message-head">AI</div>
            <div className="chat-message-body">AI 正在思考...</div>
          </div>
        )}
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          autoFocus
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
