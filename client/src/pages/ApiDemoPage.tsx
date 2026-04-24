import { useState } from 'react'
import { http, requestWithFetch } from '../services/http'

type Post = {
  id: number
  title: string
}

export function ApiDemoPage() {
  const [result, setResult] = useState<string>('点击按钮发起请求')
  const [loading, setLoading] = useState(false)

  async function handleAxiosRequest() {
    setLoading(true)
    try {
      const { data } = await http.get<Post>('/posts/1')
      setResult(`axios: #${data.id} - ${data.title}`)
    } catch (error) {
      setResult(`axios error: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleFetchRequest() {
    setLoading(true)
    try {
      const data = await requestWithFetch<Post>('/posts/1')
      setResult(`fetch: #${data.id} - ${data.title}`)
    } catch (error) {
      setResult(`fetch error: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>接口示例</h2>
      <p>默认可把 VITE_API_BASE_URL 配成 https://jsonplaceholder.typicode.com</p>
      <div className="button-group">
        <button onClick={handleAxiosRequest} disabled={loading} type="button">
          axios 请求
        </button>
        <button onClick={handleFetchRequest} disabled={loading} type="button">
          fetch 请求
        </button>
      </div>
      <pre className="result">{result}</pre>
    </section>
  )
}
