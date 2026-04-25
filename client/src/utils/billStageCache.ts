const BILL_STAGE_CACHE_KEY = 'bill-stage-cache-v1'
const BILL_STAGE_CACHE_MAX_AGE_MS = 5 * 60 * 1000

type CachePayload<T> = {
  savedAt: number
  stages: T[]
}

export function readCachedBillStages<T = unknown>(): T[] {
  try {
    const raw = window.sessionStorage.getItem(BILL_STAGE_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CachePayload<T>
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.stages) ||
      typeof parsed.savedAt !== 'number'
    ) {
      return []
    }
    if (Date.now() - parsed.savedAt > BILL_STAGE_CACHE_MAX_AGE_MS) {
      window.sessionStorage.removeItem(BILL_STAGE_CACHE_KEY)
      return []
    }
    return parsed.stages
  } catch {
    return []
  }
}

export function writeCachedBillStages<T = unknown>(stages: T[]): void {
  try {
    const payload: CachePayload<T> = {
      savedAt: Date.now(),
      stages,
    }
    window.sessionStorage.setItem(BILL_STAGE_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // 忽略缓存写入失败，不影响主流程
  }
}
