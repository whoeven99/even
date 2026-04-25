import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { writeCachedBillStages } from './utils/billStageCache'

export function App() {
  useEffect(() => {
    const timerId = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/bills/stages?limit=30')
        const json = (await response.json()) as {
          ok?: boolean
          stages?: unknown[]
        }
        if (response.ok && json?.ok && Array.isArray(json.stages)) {
          writeCachedBillStages(json.stages)
        }
      } catch {
        // 首页预加载失败时静默降级，账单页会自行请求
      }
    }, 300)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Whoeven SkyBoard</h1>
          <p className="brand-subtitle">whoeven 的个人 Dashboard</p>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            首页
          </NavLink>
          <NavLink to="/ai-chat">AI 对话</NavLink>
          <NavLink to="/bills">微信账单</NavLink>
          <NavLink to="/asset-manager">资产管家</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
