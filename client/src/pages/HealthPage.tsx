import { useMemo, useState } from "react";
import { HealthSeriesChart } from "../components/HealthSeriesChart";
import {
  bmiCategory,
  computeBmi,
  computeHealthSummary,
  formatSince18,
  genHealthId,
  hoursSince18,
  sleepHours,
  todayStr,
  useHealth,
  type BodyMetric,
  type Exercise,
  type Sleep,
} from "../hooks/useHealth";

type HealthTab = "body" | "exercise" | "sleep";

const TABS: { key: HealthTab; label: string; icon: string }[] = [
  { key: "body", label: "身体数据", icon: "⚖️" },
  { key: "exercise", label: "运动打卡", icon: "🏃" },
  { key: "sleep", label: "睡眠记录", icon: "😴" },
];

const EXERCISE_TYPES = ["跑步", "健身", "骑行", "游泳", "球类", "其他"];

function fmt(n: number | null | undefined, digits = 1): string {
  return typeof n === "number" ? n.toFixed(digits) : "--";
}

export function HealthPage() {
  const {
    data,
    loading,
    saving,
    error,
    saveProfile,
    saveBody,
    saveExercise,
    saveSleep,
  } = useHealth();
  const [tab, setTab] = useState<HealthTab>("body");
  const summary = useMemo(() => computeHealthSummary(data), [data]);
  const cat = bmiCategory(summary.bmi);

  const [heightInput, setHeightInput] = useState("");
  const [targetInput, setTargetInput] = useState("");

  // 身体数据表单（体重 + 体脂均必填）
  const [bodyDate, setBodyDate] = useState(todayStr());
  const [bodyWeight, setBodyWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");

  // 运动表单
  const [exDate, setExDate] = useState(todayStr());
  const [exType, setExType] = useState("跑步");
  const [exDuration, setExDuration] = useState("");
  const [exNote, setExNote] = useState("");

  // 睡眠表单（填写入睡与起床时间，自动算时长）
  const [sleepDate, setSleepDate] = useState(todayStr());
  const [sleepBed, setSleepBed] = useState("23:00");
  const [sleepWake, setSleepWake] = useState("07:00");
  const [sleepNote, setSleepNote] = useState("");

  const heightCm = data.profile.heightCm;
  const targetWeightKg = data.profile.targetWeightKg;

  function handleSaveHeight() {
    const v = Number(heightInput.trim());
    if (!Number.isFinite(v) || v <= 0) return;
    void saveProfile(v, targetWeightKg);
    setHeightInput("");
  }

  function handleSaveTarget() {
    const v = Number(targetInput.trim());
    if (!Number.isFinite(v) || v <= 0) return;
    void saveProfile(heightCm, v);
    setTargetInput("");
  }

  const canAddBody = bodyWeight.trim() !== "" && bodyFat.trim() !== "";

  function addBody() {
    const weight = Number(bodyWeight);
    const fat = Number(bodyFat);
    if (!Number.isFinite(weight) || !Number.isFinite(fat)) return;
    const item: BodyMetric = {
      id: genHealthId("body"),
      date: bodyDate || todayStr(),
      weightKg: weight,
      bodyFatPct: fat,
    };
    void saveBody([...data.bodyMetrics, item]);
    setBodyWeight("");
    setBodyFat("");
  }

  function addExercise() {
    const dur = exDuration.trim() ? Number(exDuration) : null;
    if (!Number.isFinite(dur as number)) return;
    const item: Exercise = {
      id: genHealthId("ex"),
      date: exDate || todayStr(),
      type: exType,
      durationMin: dur,
      note: exNote.trim() || undefined,
    };
    void saveExercise([...data.exercises, item]);
    setExDuration("");
    setExNote("");
  }

  const sleepDurationPreview = sleepHours(sleepBed, sleepWake);

  function addSleep() {
    if (!sleepBed || !sleepWake) return;
    const item: Sleep = {
      id: genHealthId("sl"),
      date: sleepDate || todayStr(),
      bedtime: sleepBed,
      waketime: sleepWake,
      hours: sleepHours(sleepBed, sleepWake),
      note: sleepNote.trim() || undefined,
    };
    void saveSleep([...data.sleeps, item]);
    setSleepNote("");
  }

  const bodySeries = useMemo(
    () => [
      {
        key: "weight",
        label: "体重",
        color: "#2563eb",
        unit: "kg",
        points: data.bodyMetrics
          .filter((b) => typeof b.weightKg === "number")
          .map((b) => ({ date: b.date, value: b.weightKg as number })),
      },
      {
        key: "fat",
        label: "体脂",
        color: "#d97706",
        unit: "%",
        points: data.bodyMetrics
          .filter((b) => typeof b.bodyFatPct === "number")
          .map((b) => ({ date: b.date, value: b.bodyFatPct as number })),
      },
    ],
    [data.bodyMetrics],
  );

  const sleepSeries = useMemo(
    () => [
      {
        key: "bed",
        label: "入睡",
        color: "#6366f1",
        points: data.sleeps
          .map((s) => ({ date: s.date, value: hoursSince18(s.bedtime) }))
          .filter((p): p is { date: string; value: number } => p.value != null),
      },
      {
        key: "wake",
        label: "起床",
        color: "#0ea5e9",
        points: data.sleeps
          .map((s) => ({ date: s.date, value: hoursSince18(s.waketime) }))
          .filter((p): p is { date: string; value: number } => p.value != null),
      },
    ],
    [data.sleeps],
  );

  return (
    <div className="hub-page">
      <header className="hub-summary">
        <div className="hub-summary-title">
          <p className="ov-hero-eyebrow">健康中心</p>
          <h2>身体 · 运动 · 睡眠</h2>
        </div>
        <div className="hub-summary-metrics">
          <div className="hub-metric">
            <span className="hub-metric-label">最新体重</span>
            <span className="hub-metric-value">
              {fmt(summary.latestWeight)}
              <small className="health-unit"> kg</small>
              {summary.weightDelta != null && summary.weightDelta !== 0 && (
                <small
                  className={`health-delta ${summary.weightDelta < 0 ? "down" : "up"}`}
                >
                  {summary.weightDelta < 0 ? "▼" : "▲"}
                  {Math.abs(summary.weightDelta).toFixed(1)}
                </small>
              )}
            </span>
          </div>
          <div className="hub-metric">
            <span className="hub-metric-label">BMI</span>
            <span className="hub-metric-value">
              {fmt(summary.bmi)}
              {cat && (
                <small className={`health-bmi-tag health-bmi-${cat.tone}`}>
                  {cat.label}
                </small>
              )}
            </span>
          </div>
          <div className="hub-metric">
            <span className="hub-metric-label">距目标体重</span>
            <span className="hub-metric-value">
              {targetWeightKg != null && summary.latestWeight != null ? (
                <>
                  {Math.abs(summary.latestWeight - targetWeightKg).toFixed(1)}
                  <small className="health-unit"> kg</small>
                  <small
                    className={`health-delta ${summary.latestWeight > targetWeightKg ? "up" : "down"}`}
                  >
                    {summary.latestWeight > targetWeightKg
                      ? "还需减"
                      : "已低于"}
                  </small>
                </>
              ) : (
                "--"
              )}
            </span>
          </div>
          <div className="hub-metric">
            <span className="hub-metric-label">体脂率</span>
            <span className="hub-metric-value">
              {fmt(summary.latestBodyFat)}
              <small className="health-unit"> %</small>
            </span>
          </div>
          <div className="hub-metric">
            <span className="hub-metric-label">本周运动</span>
            <span className="hub-metric-value">
              {summary.exerciseCount7d}
              <small className="health-unit"> 次</small>
            </span>
          </div>
          <div className="hub-metric">
            <span className="hub-metric-label">近7天均睡</span>
            <span className="hub-metric-value">
              {fmt(summary.avgSleep7d)}
              <small className="health-unit"> h</small>
            </span>
          </div>
        </div>
      </header>

      <nav className="hub-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`hub-tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <span className="hub-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {error && <p className="am-error am-page-error">{error}</p>}

      <div className="hub-body">
        {loading ? (
          <p className="muted">加载中…</p>
        ) : tab === "body" ? (
          <section className="health-card">
            <div className="health-card-head">
              <h3 className="health-card-title">体重 · 体脂 · BMI 趋势</h3>
              <div className="health-height-row">
                <span className="muted">身高</span>
                <input
                  className="health-input health-input-sm"
                  type="number"
                  placeholder={heightCm ? String(heightCm) : "cm"}
                  value={heightInput}
                  onChange={(e) => setHeightInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveHeight();
                  }}
                  onBlur={handleSaveHeight}
                />
                <span className="muted">cm</span>
              </div>
              <div className="health-height-row">
                <span className="muted">目标体重</span>
                <input
                  className="health-input health-input-sm"
                  type="number"
                  step="0.1"
                  placeholder={targetWeightKg ? String(targetWeightKg) : "kg"}
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTarget();
                  }}
                  onBlur={handleSaveTarget}
                />
                <span className="muted">kg</span>
              </div>
            </div>

            {!heightCm && (
              <p className="health-tip">
                设置身高后即可自动计算 BMI（BMI
                随体重变化，因此在记录中以数值展示）。
              </p>
            )}

            <HealthSeriesChart
              series={bodySeries}
              normalize="independent"
              referenceLines={
                targetWeightKg != null
                  ? [
                      {
                        seriesKey: "weight",
                        value: targetWeightKg,
                        label: `目标 ${targetWeightKg}kg`,
                        color: "#16a34a",
                      },
                    ]
                  : undefined
              }
            />

            <div className="health-add-row">
              <input
                className="health-input"
                type="date"
                value={bodyDate}
                onChange={(e) => setBodyDate(e.target.value)}
              />
              <input
                className="health-input"
                type="number"
                step="0.1"
                placeholder="体重 kg（必填）"
                value={bodyWeight}
                onChange={(e) => setBodyWeight(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addBody();
                }}
              />
              <input
                className="health-input"
                type="number"
                step="0.1"
                placeholder="体脂 %（必填）"
                value={bodyFat}
                onChange={(e) => setBodyFat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addBody();
                }}
              />
              <button
                type="button"
                className="health-add-btn"
                disabled={saving || !canAddBody}
                onClick={addBody}
              >
                记录
              </button>
            </div>

            <ul className="health-list">
              {[...data.bodyMetrics].reverse().map((b) => (
                <li key={b.id} className="health-list-item">
                  <span className="health-list-date">{b.date}</span>
                  <span className="health-list-main">
                    {b.weightKg != null && <span>{b.weightKg} kg</span>}
                    {b.bodyFatPct != null && (
                      <span className="health-list-sub">
                        体脂 {b.bodyFatPct}%
                      </span>
                    )}
                    {computeBmi(b.weightKg, heightCm) != null && (
                      <span className="health-list-sub">
                        BMI {computeBmi(b.weightKg, heightCm)!.toFixed(1)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="health-del"
                    title="删除"
                    disabled={saving}
                    onClick={() =>
                      void saveBody(
                        data.bodyMetrics.filter((x) => x.id !== b.id),
                      )
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
              {data.bodyMetrics.length === 0 && (
                <li className="muted">暂无记录。</li>
              )}
            </ul>
          </section>
        ) : tab === "exercise" ? (
          <section className="health-card">
            <div className="health-stat-strip">
              <div className="health-stat">
                <span className="health-stat-value">
                  {summary.exerciseCount7d}
                </span>
                <span className="health-stat-label">本周打卡次数</span>
              </div>
              <div className="health-stat">
                <span className="health-stat-value">
                  {summary.exerciseMinutes7d}
                </span>
                <span className="health-stat-label">本周总时长 (分钟)</span>
              </div>
            </div>

            <div className="health-add-row">
              <input
                className="health-input"
                type="date"
                value={exDate}
                onChange={(e) => setExDate(e.target.value)}
              />
              <select
                className="health-input"
                value={exType}
                onChange={(e) => setExType(e.target.value)}
              >
                {EXERCISE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                className="health-input"
                type="number"
                placeholder="时长 (分钟)"
                value={exDuration}
                onChange={(e) => setExDuration(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addExercise();
                }}
              />
              <input
                className="health-input"
                placeholder="备注（选填）"
                value={exNote}
                onChange={(e) => setExNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addExercise();
                }}
              />
              <button
                type="button"
                className="health-add-btn"
                disabled={saving || !exDuration.trim()}
                onClick={addExercise}
              >
                打卡
              </button>
            </div>

            <ul className="health-list">
              {[...data.exercises].reverse().map((e) => (
                <li key={e.id} className="health-list-item">
                  <span className="health-list-date">{e.date}</span>
                  <span className="health-list-main">
                    <span className="health-ex-type">{e.type}</span>
                    {e.durationMin != null && (
                      <span className="health-list-sub">
                        {e.durationMin} 分钟
                      </span>
                    )}
                    {e.note && (
                      <span className="health-list-sub">{e.note}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="health-del"
                    title="删除"
                    disabled={saving}
                    onClick={() =>
                      void saveExercise(
                        data.exercises.filter((x) => x.id !== e.id),
                      )
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
              {data.exercises.length === 0 && (
                <li className="muted">暂无运动记录。</li>
              )}
            </ul>
          </section>
        ) : (
          <section className="health-card">
            <div className="health-card-head">
              <h3 className="health-card-title">入睡 / 起床时间趋势</h3>
            </div>
            <HealthSeriesChart
              series={sleepSeries}
              normalize="shared"
              band
              formatValue={formatSince18}
            />

            <div className="health-add-row">
              <input
                className="health-input"
                type="date"
                value={sleepDate}
                onChange={(e) => setSleepDate(e.target.value)}
              />
              <label className="health-time-field">
                <span>入睡</span>
                <input
                  className="health-input"
                  type="time"
                  value={sleepBed}
                  onChange={(e) => setSleepBed(e.target.value)}
                />
              </label>
              <label className="health-time-field">
                <span>起床</span>
                <input
                  className="health-input"
                  type="time"
                  value={sleepWake}
                  onChange={(e) => setSleepWake(e.target.value)}
                />
              </label>
              <span className="health-duration-hint">
                {sleepDurationPreview != null
                  ? `约 ${sleepDurationPreview} 小时`
                  : "—"}
              </span>
              <input
                className="health-input"
                placeholder="备注（选填）"
                value={sleepNote}
                onChange={(e) => setSleepNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addSleep();
                }}
              />
              <button
                type="button"
                className="health-add-btn"
                disabled={saving || !sleepBed || !sleepWake}
                onClick={addSleep}
              >
                记录
              </button>
            </div>

            <ul className="health-list">
              {[...data.sleeps].reverse().map((s) => (
                <li key={s.id} className="health-list-item">
                  <span className="health-list-date">{s.date}</span>
                  <span className="health-list-main">
                    {s.bedtime && s.waketime && (
                      <span>
                        {s.bedtime} → {s.waketime}
                      </span>
                    )}
                    {s.hours != null && (
                      <span className="health-list-sub">{s.hours} 小时</span>
                    )}
                    {s.note && (
                      <span className="health-list-sub">{s.note}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="health-del"
                    title="删除"
                    disabled={saving}
                    onClick={() =>
                      void saveSleep(data.sleeps.filter((x) => x.id !== s.id))
                    }
                  >
                    ✕
                  </button>
                </li>
              ))}
              {data.sleeps.length === 0 && (
                <li className="muted">暂无睡眠记录。</li>
              )}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
