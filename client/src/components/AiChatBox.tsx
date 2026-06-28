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
        '你好，我是 SkyBoard 的智能助理。仪表盘的所有功能我都能调用，可以**读取、分析并帮你修改**各页面的数据：\n\n' +
        '💰 **资产 / 财务**\n' +
        '- 我现在的净资产是多少？\n' +
        '- 帮我把「招商银行」余额改成 50000\n' +
        '- 我每个月的固定支出有多少？\n\n' +
        '🧾 **账单分析**\n' +
        '- 我上个月在「餐饮」上花了多少？\n' +
        '- 分析一下最近一期账单消费\n\n' +
        '🏃 **健康**\n' +
        '- 记一下今天体重 70.5kg、体脂 18%\n' +
        '- 我这周运动了几次？\n\n' +
        '📝 **待办 / 备忘**\n' +
        '- 添加待办：明天交周报\n' +
        '- 我之前记过 Wi-Fi 密码吗？（语义搜索备忘录）\n\n' +
        '🌤️ **天气**\n' +
        '- 我这里现在天气怎么样',
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
      // 助理可能写入了待办/资产等数据，通知其他页面刷新
      window.dispatchEvent(new CustomEvent('todos:changed'))
      window.dispatchEvent(new CustomEvent('dashboard:data-changed'))
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
        已连接 LangChain Agent（Tools: 资产 · 固定支出 · 账单分析 · 健康 · 待办 · 备忘录 · 天气）
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
