type PriorityTask = {
  id: string
  title: string
  done: boolean
}

type CountdownItem = {
  id: string
  label: string
  date: string
}

const mockTasks: PriorityTask[] = [
  { id: 't1', title: '完成 Dashboard 首页模块', done: true },
  { id: 't2', title: '整理下周工作计划', done: false },
  { id: 't3', title: '30 分钟英语阅读', done: false },
]

const mockCountdowns: CountdownItem[] = [
  { id: 'c1', label: '发薪日', date: '2026-05-10' },
  { id: 'c2', label: '房租日', date: '2026-05-03' },
  { id: 'c3', label: '信用卡还款', date: '2026-05-08' },
]

const mockBudget = {
  month: '2026-04',
  total: 12000,
  used: 7830,
}

function getDaysLeft(dateString: string): number {
  const now = new Date()
  const target = new Date(dateString)
  const oneDayMs = 24 * 60 * 60 * 1000
  const diff = target.getTime() - now.getTime()
  return Math.ceil(diff / oneDayMs)
}

export function HomePage() {
  const doneCount = mockTasks.filter((task) => task.done).length
  const budgetPercent = Math.min(
    100,
    Math.round((mockBudget.used / mockBudget.total) * 100),
  )

  return (
    <section>
      <h2>whoeven 的首页</h2>
      <p className="muted">个人 Dashboard（Mock 数据版本）</p>

      <div className="dashboard-grid">
        <article className="dash-card">
          <div className="dash-card-header">
            <h3>今日三件事</h3>
            <span>
              {doneCount}/{mockTasks.length}
            </span>
          </div>
          <ul className="task-list">
            {mockTasks.map((task) => (
              <li key={task.id} className={task.done ? 'task-done' : ''}>
                <span>{task.done ? '✅' : '⬜'}</span>
                <span>{task.title}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="dash-card">
          <h3>倒计时</h3>
          <ul className="countdown-list">
            {mockCountdowns.map((item) => {
              const daysLeft = getDaysLeft(item.date)
              return (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <strong>{daysLeft >= 0 ? `还有 ${daysLeft} 天` : '已过期'}</strong>
                </li>
              )
            })}
          </ul>
        </article>

        <article className="dash-card dash-card-full">
          <div className="dash-card-header">
            <h3>本月预算进度</h3>
            <span>{mockBudget.month}</span>
          </div>
          <p className="budget-text">
            已使用 ¥{mockBudget.used} / ¥{mockBudget.total}
          </p>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${budgetPercent}%` }} />
          </div>
          <p className="muted">预算使用率：{budgetPercent}%</p>
        </article>
      </div>
    </section>
  )
}
