import { AiChatBox } from '../components/AiChatBox'

export function AssistantPage() {
  return (
    <section className="page-shell ai-chat-page-fit">
      <header className="page-hero">
        <h2>AI 助手</h2>
        <p className="muted">
          用自然语言查询天气、管理待办，基于 LangChain Agent 与后端工具链完成操作。
        </p>
      </header>
      <div className="page-panel">
        <AiChatBox />
      </div>
    </section>
  )
}
