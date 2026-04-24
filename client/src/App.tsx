import { NavLink, Outlet } from 'react-router-dom'

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Web Client</h1>
        <nav className="nav">
          <NavLink to="/" end>
            首页
          </NavLink>
          <NavLink to="/about">关于</NavLink>
          <NavLink to="/api-demo">接口示例</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
