import { useState } from 'react'
import { TodoBoard } from '../components/TodoBoard'
import { DiaryPage } from './DiaryPage'

type WorkspaceTab = 'todos' | 'notes'

const TABS: { key: WorkspaceTab; label: string; icon: string }[] = [
  { key: 'todos', label: '待办看板', icon: '📌' },
  { key: 'notes', label: '备忘录', icon: '📝' },
]

export function WorkspacePage() {
  const [tab, setTab] = useState<WorkspaceTab>('todos')

  return (
    <div className="hub-page">
      <header className="hub-summary hub-summary-slim">
        <div className="hub-summary-title">
          <p className="ov-hero-eyebrow">工作台</p>
          <h2>待办与备忘</h2>
        </div>
      </header>

      <nav className="hub-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`hub-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="hub-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="hub-body hub-body-fill">
        {tab === 'todos' && (
          <div className="workspace-todos">
            <TodoBoard />
          </div>
        )}
        {tab === 'notes' && <DiaryPage />}
      </div>
    </div>
  )
}
