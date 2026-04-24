import { AiChatBox } from '../components/AiChatBox'

export function AiChatPage() {
  return (
    <section>
      <h2>AI 对话</h2>
      <p className="muted">页面已预留 AI 对话区，并接入 LangChain 后端接口。</p>
      <AiChatBox />
    </section>
  )
}
