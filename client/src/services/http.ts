import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

function buildRequestUrl(url: string): string {
  // Internal backend APIs should always use same-origin path.
  if (url.startsWith('/api/')) {
    return url
  }
  return `${API_BASE_URL}${url}`
}

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error?.response?.data?.message ?? error?.message ?? 'Request failed'
    return Promise.reject(new Error(message))
  },
)

export async function requestWithFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(buildRequestUrl(url), {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    })
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : '网络异常，请稍后重试'
    throw new Error(message)
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as { message?: string }
      throw new Error(data.message || `HTTP ${response.status}`)
    }
    const text = await response.text()
    throw new Error(text || `HTTP ${response.status}`)
  }

  return (await response.json()) as T
}
