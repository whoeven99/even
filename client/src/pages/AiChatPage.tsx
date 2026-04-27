import { AiChatBox } from '../components/AiChatBox'

export function AiChatPage() {
  return (
    <section className="page-shell ai-chat-page-fit">
      <header className="page-hero">
        <h2>AI 对话助手</h2>
        <p className="muted">
          通过自然语言直接查询天气、管理待办，基于 LangChain Agent 与后端工具链完成操作。
        </p>
      </header>
      <div className="page-panel">
        <AiChatBox />
      </div>
    </section>
  )
}
