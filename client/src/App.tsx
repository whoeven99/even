import { NavLink, Outlet } from 'react-router-dom'

export function App() {
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
          <NavLink to="/about">关于</NavLink>
          <NavLink to="/api-demo">接口示例</NavLink>
          <NavLink to="/ai-chat">AI 对话</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
