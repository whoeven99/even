const { z } = require('zod')
const {
  getHealth,
  updateProfile,
  updateBodyMetrics,
  updateExercises,
  updateSleeps,
} = require('../healthStore')

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function bmiOf(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null
  const m = heightCm / 100
  return weightKg / (m * m)
}

function createGetHealthTool(T) {
  return new T({
    name: 'get_health',
    description:
      '读取健康数据概览：身高、最新体重/体脂/BMI、近 7 天运动次数与时长、近 7 天平均睡眠，以及最近几条体征记录。回答健康相关问题前调用。',
    schema: z.object({}),
    func: async () => {
      const data = await getHealth()
      const body = data.bodyMetrics
      const latest = [...body].reverse().find((b) => typeof b.weightKg === 'number') || null
      const bmi = latest ? bmiOf(latest.weightKg, data.profile.heightCm) : null
      const cutoff = Date.now() - 7 * 86400000
      const within7 = (d) => new Date(`${d}T00:00:00`).getTime() >= cutoff
      const ex7 = data.exercises.filter((e) => within7(e.date))
      const exMin = ex7.reduce((s, e) => s + (e.durationMin || 0), 0)
      const sleep7 = data.sleeps.filter((s) => within7(s.date) && typeof s.hours === 'number')
      const avgSleep = sleep7.length ? sleep7.reduce((s, x) => s + x.hours, 0) / sleep7.length : null

      const recent = [...body].slice(-5).reverse().map((b) =>
        `  - ${b.date}: ${b.weightKg != null ? b.weightKg + 'kg' : ''}${b.bodyFatPct != null ? ' 体脂' + b.bodyFatPct + '%' : ''}`,
      )

      return [
        `身高：${data.profile.heightCm != null ? data.profile.heightCm + 'cm' : '未设置'}`,
        `最新体重：${latest?.weightKg != null ? latest.weightKg + 'kg' : '无'}，BMI：${bmi != null ? bmi.toFixed(1) : '无'}`,
        `近7天运动：${ex7.length} 次 / ${exMin} 分钟`,
        `近7天平均睡眠：${avgSleep != null ? avgSleep.toFixed(1) + ' 小时' : '无'}`,
        recent.length ? `最近体征记录：\n${recent.join('\n')}` : '暂无体征记录',
      ].join('\n')
    },
  })
}

function createSetHeightTool(T) {
  return new T({
    name: 'set_height',
    description: '设置身高（厘米），用于计算 BMI。',
    schema: z.object({ heightCm: z.number().describe('身高，单位厘米') }),
    func: async ({ heightCm }) => {
      await updateProfile({ heightCm })
      return `已设置身高为 ${heightCm} cm`
    },
  })
}

function createAddBodyMetricTool(T) {
  return new T({
    name: 'add_body_metric',
    description: '记录一条体征数据（体重 / 体脂）。日期默认今天。',
    schema: z.object({
      weightKg: z.number().optional().describe('体重，单位 kg'),
      bodyFatPct: z.number().optional().describe('体脂率，百分比数值'),
      date: z.string().optional().describe('日期 YYYY-MM-DD，默认今天'),
    }),
    func: async ({ weightKg, bodyFatPct, date }) => {
      if (weightKg == null && bodyFatPct == null) return '请至少提供体重或体脂之一。'
      const { bodyMetrics } = await getHealth()
      const item = {
        id: genId('body'),
        date: date || today(),
        weightKg: typeof weightKg === 'number' ? weightKg : null,
        bodyFatPct: typeof bodyFatPct === 'number' ? bodyFatPct : null,
      }
      await updateBodyMetrics([...bodyMetrics, item])
      return `已记录 ${item.date} 的体征：${weightKg != null ? '体重 ' + weightKg + 'kg ' : ''}${bodyFatPct != null ? '体脂 ' + bodyFatPct + '%' : ''}`
    },
  })
}

function createAddExerciseTool(T) {
  return new T({
    name: 'add_exercise',
    description: '记录一次运动打卡。日期默认今天。',
    schema: z.object({
      type: z.string().optional().describe('运动类型，如 跑步/健身/骑行/游泳'),
      durationMin: z.number().describe('时长，单位分钟'),
      date: z.string().optional().describe('日期 YYYY-MM-DD，默认今天'),
      note: z.string().optional(),
    }),
    func: async ({ type, durationMin, date, note }) => {
      const { exercises } = await getHealth()
      const item = {
        id: genId('ex'),
        date: date || today(),
        type: type || '运动',
        durationMin: typeof durationMin === 'number' ? durationMin : null,
        note: note || undefined,
      }
      await updateExercises([...exercises, item])
      return `已记录 ${item.date} 的运动：${item.type} ${durationMin} 分钟`
    },
  })
}

function createAddSleepTool(T) {
  return new T({
    name: 'add_sleep',
    description: '记录一次睡眠时长。日期默认今天。',
    schema: z.object({
      hours: z.number().describe('睡眠小时数'),
      date: z.string().optional().describe('日期 YYYY-MM-DD，默认今天'),
      note: z.string().optional(),
    }),
    func: async ({ hours, date, note }) => {
      const { sleeps } = await getHealth()
      const item = { id: genId('sl'), date: date || today(), hours, note: note || undefined }
      await updateSleeps([...sleeps, item])
      return `已记录 ${item.date} 的睡眠：${hours} 小时`
    },
  })
}

module.exports = {
  createGetHealthTool,
  createSetHeightTool,
  createAddBodyMetricTool,
  createAddExerciseTool,
  createAddSleepTool,
}
