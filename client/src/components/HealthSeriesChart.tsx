type SeriesPoint = { date: string; value: number };

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  unit?: string;
  points: SeriesPoint[];
};

function formatMmDd(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 多序列折线图。支持：
 * - normalize='independent'：各序列按自身范围独立缩放（用于体重 kg 与体脂 % 这种不同量纲的同图对比）。
 * - normalize='shared'：所有序列共用一个数值域（用于入睡/起床这种同量纲对比），可选 band 在两条线间填充区域。
 */
export type ReferenceLine = {
  seriesKey: string;
  value: number;
  label: string;
  color: string;
};

export function HealthSeriesChart({
  series,
  normalize = "independent",
  band = false,
  formatValue,
  height = 210,
  referenceLines,
}: {
  series: ChartSeries[];
  normalize?: "independent" | "shared";
  band?: boolean;
  formatValue?: (v: number) => string;
  height?: number;
  referenceLines?: ReferenceLine[];
}) {
  const allDates = Array.from(
    new Set(series.flatMap((s) => s.points.map((p) => p.date))),
  ).sort();
  const hasData = series.some((s) => s.points.length > 0);
  if (!hasData || allDates.length === 0) {
    return (
      <p className="muted health-chart-empty">
        暂无数据，先在下方添加一条记录。
      </p>
    );
  }

  const width = 560;
  const padding = { top: 24, right: 18, bottom: 28, left: 42 };

  const xAt = (i: number) =>
    allDates.length === 1
      ? width / 2
      : padding.left +
        (i * (width - padding.left - padding.right)) / (allDates.length - 1);

  function domainOf(values: number[]) {
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const range = Math.max(0.1, hi - lo);
    const pad = range * 0.15;
    return { lo: lo - pad, hi: hi + pad };
  }

  const sharedDomain =
    normalize === "shared"
      ? domainOf(series.flatMap((s) => s.points.map((p) => p.value)))
      : null;
  const domains = series.map((s) =>
    normalize === "shared" && sharedDomain
      ? sharedDomain
      : domainOf(s.points.map((p) => p.value)),
  );

  const yAt = (v: number, di: number) => {
    const d = domains[di];
    const span = Math.max(0.1, d.hi - d.lo);
    return (
      padding.top +
      ((d.hi - v) / span) * (height - padding.top - padding.bottom)
    );
  };

  const dateIndex = new Map(allDates.map((d, i) => [d, i]));
  const labelStep = Math.ceil(allDates.length / 7);

  // 区间填充（取前两条序列在共同日期上的范围）
  let bandPath = "";
  if (band && series.length >= 2 && normalize === "shared") {
    const s0 = new Map(series[0].points.map((p) => [p.date, p.value]));
    const s1 = new Map(series[1].points.map((p) => [p.date, p.value]));
    const common = allDates.filter((d) => s0.has(d) && s1.has(d));
    if (common.length) {
      const top = common.map(
        (d) => `${xAt(dateIndex.get(d)!)},${yAt(s0.get(d)!, 0)}`,
      );
      const bottom = [...common]
        .reverse()
        .map((d) => `${xAt(dateIndex.get(d)!)},${yAt(s1.get(d)!, 1)}`);
      bandPath = `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`;
    }
  }

  return (
    <div className="health-chart-wrap">
      <div className="health-legend">
        {series.map((s) => {
          const last = s.points[s.points.length - 1];
          const txt = last
            ? formatValue
              ? formatValue(last.value)
              : `${last.value}${s.unit || ""}`
            : "--";
          return (
            <span key={s.key} className="health-legend-item">
              <i
                className="health-legend-dot"
                style={{ background: s.color }}
              />
              {s.label}
              <strong>{txt}</strong>
            </span>
          );
        })}
      </div>
      <svg
        className="health-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="健康趋势图"
      >
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          className="health-chart-axis"
        />
        {bandPath && <path d={bandPath} fill={series[0].color} opacity="0.1" />}
        {referenceLines?.map((ref) => {
          const di = series.findIndex((s) => s.key === ref.seriesKey);
          if (di === -1) return null;
          const y = yAt(ref.value, di);
          return (
            <g key={`ref-${ref.seriesKey}-${ref.value}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke={ref.color}
                strokeWidth="1.5"
                strokeDasharray="5 3"
                opacity="0.8"
              />
              <text
                x={width - padding.right}
                y={y - 4}
                textAnchor="end"
                className="health-chart-ref-label"
                fill={ref.color}
              >
                {ref.label}
              </text>
            </g>
          );
        })}
        {series.map((s, di) => {
          const line = s.points
            .map((p) => `${xAt(dateIndex.get(p.date)!)},${yAt(p.value, di)}`)
            .join(" ");
          return (
            <g key={s.key}>
              <polyline
                points={line}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p) => (
                <circle
                  key={p.date}
                  cx={xAt(dateIndex.get(p.date)!)}
                  cy={yAt(p.value, di)}
                  r="3"
                  fill={s.color}
                />
              ))}
            </g>
          );
        })}
        {allDates.map((d, i) =>
          i % labelStep === 0 ? (
            <text
              key={d}
              x={xAt(i)}
              y={height - 9}
              textAnchor="middle"
              className="health-chart-label"
            >
              {formatMmDd(d)}
            </text>
          ) : null,
        )}
        {normalize === "shared" && sharedDomain && (
          <>
            <text x="4" y={padding.top + 4} className="health-chart-axis-val">
              {formatValue
                ? formatValue(sharedDomain.hi)
                : sharedDomain.hi.toFixed(1)}
            </text>
            <text
              x="4"
              y={height - padding.bottom}
              className="health-chart-axis-val"
            >
              {formatValue
                ? formatValue(sharedDomain.lo)
                : sharedDomain.lo.toFixed(1)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
