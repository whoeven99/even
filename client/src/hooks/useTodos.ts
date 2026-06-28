import { useCallback, useEffect, useRef, useState } from 'react'
import { requestWithFetch } from '../services/http'

export type TodoItem = {
  id: string
  text: string
  done: boolean
  pinned: boolean
  hidden: boolean
  time: string
  createdAt: string
  updatedAt: string
}

type TodoApiResponse = {
  ok: boolean
  items: TodoItem[]
  updatedAt: string | null
  message?: string
}

export function formatTodoTime(dateText: string): string {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) return '时间未设置'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function toDateTimeLocalValue(dateText: string): string {
  const date = new Date(dateText)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export function toDateStartLocalValue(dateText: string): string {
  const full = toDateTimeLocalValue(dateText)
  if (!full) return ''
  return `${full.slice(0, 10)}T00:00`
}

export function getStickyColorIndex(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 5
}

/**
 * 待办数据与全部 CRUD 逻辑的共享 Hook。
 * 概览页的快捷视图与工作台的完整看板共用同一份状态来源，
 * 并通过全局 `todos:changed` 事件与 AI 对话保持同步。
 */
export function useTodos() {
  const [items, setItems] = useState<TodoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const load = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true
    if (showLoading && isMountedRef.current) setLoading(true)
    if (isMountedRef.current) setError(null)
    try {
      const data = await requestWithFetch<TodoApiResponse>('/api/todos')
      if (isMountedRef.current) setItems(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      if (isMountedRef.current) setError(err instanceof Error ? err.message : '待办读取失败')
    } finally {
      if (showLoading && isMountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = () => void load({ showLoading: false })
    window.addEventListener('todos:changed', handler)
    return () => window.removeEventListener('todos:changed', handler)
  }, [load])

  const mutate = useCallback(
    async (run: () => Promise<TodoApiResponse>) => {
      setSaving(true)
      setError(null)
      try {
        const data = await run()
        if (isMountedRef.current) setItems(Array.isArray(data.items) ? data.items : [])
        return true
      } catch (err) {
        if (isMountedRef.current) setError(err instanceof Error ? err.message : '待办操作失败')
        return false
      } finally {
        if (isMountedRef.current) setSaving(false)
      }
    },
    [],
  )

  const createTodo = useCallback(
    (text: string, time?: string) =>
      mutate(() =>
        requestWithFetch<TodoApiResponse>('/api/todos', {
          method: 'POST',
          body: JSON.stringify({ text, time: time || undefined }),
        }),
      ),
    [mutate],
  )

  const patchTodo = useCallback(
    (id: string, patch: Partial<Pick<TodoItem, 'text' | 'done' | 'pinned' | 'hidden' | 'time'>>) =>
      mutate(() =>
        requestWithFetch<TodoApiResponse>(`/api/todos/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        }),
      ),
    [mutate],
  )

  const removeTodo = useCallback(
    (id: string) =>
      mutate(() =>
        requestWithFetch<TodoApiResponse>(`/api/todos/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      ),
    [mutate],
  )

  return {
    items,
    loading,
    saving,
    error,
    setError,
    reload: load,
    createTodo,
    patchTodo,
    removeTodo,
  }
}
