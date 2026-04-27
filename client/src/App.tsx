import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { requestWithFetch } from './services/http'
import { writeCachedBillStages } from './utils/billStageCache'

type AccessConfigResponse = {
  ok: boolean
  env?: string
  requirePassword?: boolean
}

type AccessVerifyResponse = {
  ok: boolean
  verified?: boolean
}

const ACCESS_STORAGE_PREFIX = 'even-access-verified:'
const ACCESS_CACHE_TTL_MS = 10 * 24 * 60 * 60 * 1000

type AccessCachePayload = {
  verified: boolean
  expiresAt: number
}

function readAccessCache(storageKey: string): boolean {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw) as AccessCachePayload
    if (!parsed?.verified || typeof parsed.expiresAt !== 'number') {
      localStorage.removeItem(storageKey)
      return false
    }
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(storageKey)
      return false
    }
    return true
  } catch {
    localStorage.removeItem(storageKey)
    return false
  }
}

function writeAccessCache(storageKey: string) {
  const payload: AccessCachePayload = {
    verified: true,
    expiresAt: Date.now() + ACCESS_CACHE_TTL_MS,
  }
  localStorage.setItem(storageKey, JSON.stringify(payload))
}

export function App() {
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [accessEnv, setAccessEnv] = useState('local')
  const [passwordInput, setPasswordInput] = useState('')
  const [accessError, setAccessError] = useState('')
  const [verifyingAccess, setVerifyingAccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function initAccessGate() {
      setCheckingAccess(true)
      setAccessError('')
      try {
        const config = await requestWithFetch<AccessConfigResponse>('/api/access/config')
        if (cancelled) return
        const envValue = String(config.env || 'local')
        setAccessEnv(envValue)
        const storageKey = `${ACCESS_STORAGE_PREFIX}${envValue}`
        const hasLocalToken = readAccessCache(storageKey)
        if (!config.requirePassword || hasLocalToken) {
          setIsAuthorized(true)
        } else {
          setIsAuthorized(false)
        }
      } catch (error) {
        if (!cancelled) {
          setAccessError(error instanceof Error ? error.message : '访问校验失败')
          setIsAuthorized(false)
        }
      } finally {
        if (!cancelled) {
          setCheckingAccess(false)
        }
      }
    }
    void initAccessGate()
    return () => {
      cancelled = true
    }
  }, [])

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!passwordInput.trim() || verifyingAccess) return
    setVerifyingAccess(true)
    setAccessError('')
    try {
      const result = await requestWithFetch<AccessVerifyResponse>('/api/access/verify', {
        method: 'POST',
        body: JSON.stringify({ password: passwordInput.trim() }),
      })
      if (!result.ok || !result.verified) {
        throw new Error('密码验证失败')
      }
      const storageKey = `${ACCESS_STORAGE_PREFIX}${accessEnv}`
      writeAccessCache(storageKey)
      setIsAuthorized(true)
      setPasswordInput('')
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : '密码验证失败')
    } finally {
      setVerifyingAccess(false)
    }
  }

  useEffect(() => {
    if (!isAuthorized) return
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
  }, [isAuthorized])

  if (checkingAccess) {
    return (
      <div className="access-gate-screen">
        <div className="access-gate-card">
          <h2>正在检查访问权限</h2>
          <p className="muted">请稍候...</p>
        </div>
      </div>
    )
  }

  if (!isAuthorized) {
    return (
      <div className="access-gate-screen">
        <form className="access-gate-card" onSubmit={submitPassword}>
          <h2>请输入访问密码</h2>
          <p className="muted">当前环境：{accessEnv}</p>
          <input
            className="access-gate-input"
            type="password"
            value={passwordInput}
            autoFocus
            placeholder="请输入密码"
            disabled={verifyingAccess}
            onChange={(event) => setPasswordInput(event.target.value)}
          />
          {accessError ? <p className="access-gate-error">{accessError}</p> : null}
          <button type="submit" disabled={verifyingAccess || !passwordInput.trim()}>
            {verifyingAccess ? '验证中...' : '进入系统'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="app-bg">
      <div className="app-shell">
        <header className="app-header">
          <div>
            <p className="brand-badge">Whoeven Dashboard</p>
            <h1>Whoeven SkyBoard</h1>
            <p className="brand-subtitle">统一管理账单、资产、待办与 AI 助手</p>
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
        <footer className="app-footer">
          <span>SkyBoard</span>
          <span className="muted">数据仅用于当前环境内展示与分析</span>
        </footer>
      </div>
    </div>
  )
}
