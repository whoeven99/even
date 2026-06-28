import { useCallback, useEffect, useRef, useState } from 'react'
import { requestWithFetch } from '../services/http'

export type BodyMetric = {
  id: string
  date: string
  weightKg: number | null
  bodyFatPct: number | null
  note?: string
}

export type Exercise = {
  id: string
  date: string
  type: string
  durationMin: number | null
  note?: string
}

export type Sleep = {
  id: string
  date: string
  hours: number | null
  note?: string
}

export type HealthProfile = { heightCm: number | null }

export type HealthData = {
  profile: HealthProfile
  bodyMetrics: BodyMetric[]
  exercises: Exercise[]
  sleeps: Sleep[]
  updatedAt: string | null
}

type HealthApiResponse = { ok: boolean; message?: string } & HealthData

const EMPTY: HealthData = {
  profile: { heightCm: null },
  bodyMetrics: [],
  exercises: [],
  sleeps: [],
  updatedAt: null,
}

export function genHealthId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null
  const m = heightCm / 100
  return weightKg / (m * m)
}

export function bmiCategory(bmi: number | null): { label: string; tone: 'low' | 'ok' | 'high' | 'over' } | null {
  if (bmi == null) return null
  if (bmi < 18.5) return { label: '偏瘦', tone: 'low' }
  if (bmi < 24) return { label: '正常', tone: 'ok' }
  if (bmi < 28) return { label: '偏胖', tone: 'high' }
  return { label: '肥胖', tone: 'over' }
}

function withinLastDays(date: string, days: number): boolean {
  const d = new Date(`${date}T00:00:00`).getTime()
  if (Number.isNaN(d)) return false
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return d >= cutoff
}

export type HealthSummary = {
  latestWeight: number | null
  weightDelta: number | null
  latestBodyFat: number | null
  bmi: number | null
  weightSeries: { date: string; value: number }[]
  exerciseCount7d: number
  exerciseMinutes7d: number
  avgSleep7d: number | null
  lastSleep: number | null
}

export function computeHealthSummary(data: HealthData): HealthSummary {
  const body = data.bodyMetrics // asc by date
  const withWeight = body.filter((b) => typeof b.weightKg === 'number')
  const latest = withWeight[withWeight.length - 1] ?? null
  const prev = withWeight[withWeight.length - 2] ?? null
  const latestWeight = latest?.weightKg ?? null
  const weightDelta = latest?.weightKg != null && prev?.weightKg != null ? latest.weightKg - prev.weightKg : null

  const latestFatEntry = [...body].reverse().find((b) => typeof b.bodyFatPct === 'number')
  const bmi = computeBmi(latestWeight, data.profile.heightCm)

  const weightSeries = withWeight.slice(-14).map((b) => ({ date: b.date, value: b.weightKg as number }))

  const ex7 = data.exercises.filter((e) => withinLastDays(e.date, 7))
  const exerciseMinutes7d = ex7.reduce((s, e) => s + (e.durationMin || 0), 0)

  const sleep7 = data.sleeps.filter((s) => withinLastDays(s.date, 7) && typeof s.hours === 'number')
  const avgSleep7d = sleep7.length ? sleep7.reduce((s, x) => s + (x.hours as number), 0) / sleep7.length : null
  const lastSleepEntry = data.sleeps.filter((s) => typeof s.hours === 'number').slice(-1)[0] ?? null

  return {
    latestWeight,
    weightDelta,
    latestBodyFat: latestFatEntry?.bodyFatPct ?? null,
    bmi,
    weightSeries,
    exerciseCount7d: ex7.length,
    exerciseMinutes7d,
    avgSleep7d,
    lastSleep: lastSleepEntry?.hours ?? null,
  }
}

/**
 * 健康数据的读取与写入 Hook。各分区（体征/运动/睡眠/身高）以整组替换的方式保存，
 * 与资产、固定支出等模块保持一致。
 */
export function useHealth() {
  const [data, setData] = useState<HealthData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (mountedRef.current) setLoading(true)
    if (mountedRef.current) setError(null)
    try {
      const res = await requestWithFetch<HealthApiResponse>('/api/health-tracker')
      if (mountedRef.current) {
        setData({
          profile: res.profile ?? { heightCm: null },
          bodyMetrics: res.bodyMetrics ?? [],
          exercises: res.exercises ?? [],
          sleeps: res.sleeps ?? [],
          updatedAt: res.updatedAt ?? null,
        })
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : '健康数据读取失败')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const handler = () => void load()
    window.addEventListener('dashboard:data-changed', handler)
    return () => window.removeEventListener('dashboard:data-changed', handler)
  }, [load])

  const persist = useCallback(async (path: string, body: unknown) => {
    if (mountedRef.current) setSaving(true)
    if (mountedRef.current) setError(null)
    try {
      const res = await requestWithFetch<HealthApiResponse>(`/api/health-tracker/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      if (mountedRef.current) {
        setData({
          profile: res.profile ?? { heightCm: null },
          bodyMetrics: res.bodyMetrics ?? [],
          exercises: res.exercises ?? [],
          sleeps: res.sleeps ?? [],
          updatedAt: res.updatedAt ?? null,
        })
      }
      return true
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : '保存失败')
      return false
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }, [])

  const saveProfile = useCallback((heightCm: number | null) => persist('profile', { heightCm }), [persist])
  const saveBody = useCallback((items: BodyMetric[]) => persist('body', { items }), [persist])
  const saveExercise = useCallback((items: Exercise[]) => persist('exercise', { items }), [persist])
  const saveSleep = useCallback((items: Sleep[]) => persist('sleep', { items }), [persist])

  return { data, loading, saving, error, reload: load, saveProfile, saveBody, saveExercise, saveSleep }
}
