type Point = { date: string; value: number }

function formatMmDd(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 通用折线趋势图（体重 / 体脂 / BMI / 睡眠等共用）。
 * 沿用天气图的 SVG 画法，保持整体视觉一致。
 */
export function HealthTrendChart({
  points,
  unit = '',
  color = '#2563eb',
  height = 180,
}: {
  points: Point[]
  unit?: string
  color?: string
  height?: number
}) {
  const valid = points.filter((p) => typeof p.value === 'number' && Number.isFinite(p.value))
  if (valid.length === 0) {
    return <p className="muted health-chart-empty">暂无数据，先在下方添加一条记录。</p>
  }

  const width = 560
  const padding = { top: 18, right: 22, bottom: 28, left: 36 }
  const values = valid.map((p) => p.value)
  const vMin = Math.min(...values)
  const vMax = Math.max(...values)
  const range = Math.max(0.1, vMax - vMin)
  const pad = range * 0.15

  const lo = vMin - pad
  const hi = vMax + pad
  const span = Math.max(0.1, hi - lo)

  const xAt = (i: number) =>
    valid.length === 1
      ? width / 2
      : padding.left + (i * (width - padding.left - padding.right)) / (valid.length - 1)
  const yAt = (v: number) =>
    padding.top + ((hi - v) / span) * (height - padding.top - padding.bottom)

  const line = valid.map((p, i) => `${xAt(i)},${yAt(p.value)}`).join(' ')
  const areaPath =
    `M ${xAt(0)},${height - padding.bottom} ` +
    valid.map((p, i) => `L ${xAt(i)},${yAt(p.value)}`).join(' ') +
    ` L ${xAt(valid.length - 1)},${height - padding.bottom} Z`

  // 只在数据点不太密集时显示每个 x 轴标签
  const labelStep = Math.ceil(valid.length / 7)

  return (
    <div className="health-chart-wrap">
      <svg
        className="health-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="健康趋势图"
      >
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} className="health-chart-axis" />
        <path d={areaPath} fill={color} opacity="0.08" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {valid.map((p, i) => (
          <g key={`${p.date}-${i}`}>
            <circle cx={xAt(i)} cy={yAt(p.value)} r="3" fill={color} />
            {i % labelStep === 0 && (
              <text x={xAt(i)} y={height - 9} textAnchor="middle" className="health-chart-label">
                {formatMmDd(p.date)}
              </text>
            )}
          </g>
        ))}
        <text x="4" y={padding.top + 4} className="health-chart-axis-val">{hi.toFixed(1)}{unit}</text>
        <text x="4" y={height - padding.bottom} className="health-chart-axis-val">{lo.toFixed(1)}{unit}</text>
      </svg>
    </div>
  )
}
