import { AiChatBox } from '../components/AiChatBox'

export function AssistantPage() {
  return (
    <section className="page-shell ai-chat-page-fit">
      <header className="page-hero">
        <h2>AI 助手</h2>
        <p className="muted">
          一个能调用仪表盘全部功能的 Agent：读取并分析你的资产、固定支出、账单、待办与备忘，也能在你授意下帮你写入数据。
        </p>
      </header>
      <div className="page-panel">
        <AiChatBox />
      </div>
    </section>
  )
}
