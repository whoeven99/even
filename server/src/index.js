require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const multer = require('multer')
const { chatWithAi, queryRecentWeatherDays } = require('./aiChat')
const {
  createBillStageFromUpload,
  computeBillFromStage,
  importAndCompute,
  getStorageStatus,
  listBillStages,
  deleteBillStage,
} = require('./billAiParse')
const { getAssets, updateAssets } = require('./assetStore')
const { getTodos, createTodo, updateTodo, deleteTodo } = require('./todoStore')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
})

const app = express()
const PORT = Number(process.env.PORT) || 3000
const clientDistPath = path.resolve(__dirname, '../../client/dist')
const runtimeEnv = String(process.env.env || process.env.ENV || 'local').trim().toLowerCase()
const requireAccessPassword = runtimeEnv !== 'local'
const ACCESS_PASSWORD = '155010'

app.use(cors())
app.use(express.json())

const api = express.Router()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function extractClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for']
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    const first = xForwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  const xRealIp = req.headers['x-real-ip']
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return xRealIp.trim()
  }
  return String(req.ip || '').trim()
}

api.get('/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  })
})

api.post('/echo', (req, res) => {
  res.json({
    ok: true,
    received: req.body ?? null,
  })
})

api.get('/access/config', (_req, res) => {
  res.json({
    ok: true,
    env: runtimeEnv,
    requirePassword: requireAccessPassword,
  })
})

api.post('/access/verify', (req, res) => {
  if (!requireAccessPassword) {
    res.json({ ok: true, verified: true })
    return
  }
  const password = String(req.body?.password || '')
  if (password !== ACCESS_PASSWORD) {
    res.status(401).json({ ok: false, verified: false, message: '密码错误' })
    return
  }
  res.json({ ok: true, verified: true })
})

async function handleBillImport(req, res) {
  if (!req.file?.buffer) {
    res.status(400).json({ ok: false, message: '请上传账单文件（字段名 file）' })
    return
  }
  try {
    const result = await importAndCompute(req.file.buffer, req.file.originalname || '')
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : '账单解析失败',
    })
  }
}

api.post('/bills/import-stage', upload.single('file'), async (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ ok: false, message: '请上传账单文件（字段名 file）' })
    return
  }
  try {
    const staged = await createBillStageFromUpload(
      req.file.buffer,
      req.file.originalname || '',
    )
    res.json({ ok: true, ...staged })
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : '账单暂存失败',
    })
  }
})

api.post('/bills/compute', async (req, res) => {
  const stageId = req.body?.stageId
  if (typeof stageId !== 'string' || !stageId.trim()) {
    res.status(400).json({ ok: false, message: 'stageId 为必填字符串' })
    return
  }
  try {
    const result = await computeBillFromStage(stageId.trim())
    res.json({ ok: true, ...result })
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : '账单计算失败',
    })
  }
})

api.post('/bills/import', upload.single('file'), handleBillImport)

api.get('/bills/storage-status', async (_req, res) => {
  try {
    const status = await getStorageStatus()
    res.json({ ok: true, ...status })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '读取存储状态失败',
    })
  }
})

api.get('/bills/stages', async (req, res) => {
  const limitRaw = req.query?.limit
  const limit = typeof limitRaw === 'string' ? Number(limitRaw) : 20
  try {
    await wait(300)
    const stages = await listBillStages(limit)
    res.json({ ok: true, stages })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '读取暂存列表失败',
    })
  }
})

api.delete('/bills/stages/:stageId', async (req, res) => {
  const stageId = String(req.params?.stageId || '').trim()
  if (!stageId) {
    res.status(400).json({ ok: false, message: 'stageId 为必填字符串' })
    return
  }
  try {
    const deleted = await deleteBillStage(stageId)
    if (!deleted.deleted) {
      res.status(404).json({ ok: false, message: '暂存不存在或已删除', ...deleted })
      return
    }
    res.json({ ok: true, ...deleted })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '删除暂存失败',
    })
  }
})

api.get('/assets', async (_req, res) => {
  try {
    const data = await getAssets()
    res.json({ ok: true, ...data })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '资产读取失败',
    })
  }
})

api.put('/assets', async (req, res) => {
  const groups = req.body?.groups
  try {
    const data = await updateAssets(groups)
    res.json({ ok: true, ...data })
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : '资产更新失败',
    })
  }
})

api.get('/todos', async (_req, res) => {
  try {
    const data = await getTodos()
    res.json({ ok: true, ...data })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '待办读取失败',
    })
  }
})

api.post('/todos', async (req, res) => {
  const text = req.body?.text
  try {
    const data = await createTodo(text)
    res.json({ ok: true, ...data })
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : '待办新增失败',
    })
  }
})

api.put('/todos/:todoId', async (req, res) => {
  const todoId = req.params?.todoId
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const patch = {}
  if (Object.prototype.hasOwnProperty.call(body, 'text')) {
    patch.text = body.text
  }
  if (Object.prototype.hasOwnProperty.call(body, 'done')) {
    patch.done = body.done
  }
  try {
    const data = await updateTodo(todoId, patch)
    res.json({ ok: true, ...data })
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : '待办更新失败',
    })
  }
})

api.delete('/todos/:todoId', async (req, res) => {
  const todoId = req.params?.todoId
  try {
    const data = await deleteTodo(todoId)
    res.json({ ok: true, ...data })
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : '待办删除失败',
    })
  }
})

api.post('/ai/chat', async (req, res) => {
  const message = req.body?.message
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({
      ok: false,
      message: 'message 为必填字符串',
    })
    return
  }

  try {
    const reply = await chatWithAi(message.trim())
    res.json({
      ok: true,
      reply,
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'AI 服务异常',
    })
  }
})

api.get('/weather/recent', async (req, res) => {
  const cityRaw = req.query?.city
  const city = typeof cityRaw === 'string' && cityRaw.trim() ? cityRaw.trim() : '杭州'
  const daysRaw = req.query?.days
  const days = typeof daysRaw === 'string' ? Number(daysRaw) : 3
  try {
    const weather = await queryRecentWeatherDays(city, days)
    res.json({ ok: true, ...weather })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '天气查询失败',
    })
  }
})

api.get('/weather/city-by-ip', async (req, res) => {
  const clientIp = extractClientIp(req)
  const normalizedIp =
    clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1'
      ? ''
      : clientIp
  const lookupPlans = normalizedIp
    ? [
        {
          source: 'ip-api.com',
          url: `http://ip-api.com/json/${encodeURIComponent(normalizedIp)}?lang=zh-CN`,
          readCity: (json) => String(json?.city || '').trim(),
          checkError: (json) => (json?.status === 'fail' ? String(json?.message || '定位失败') : ''),
        },
        {
          source: 'ipapi.co',
          url: `https://ipapi.co/${encodeURIComponent(normalizedIp)}/json/`,
          readCity: (json) => String(json?.city || '').trim(),
          checkError: (json) => String(json?.error || '').trim(),
        },
      ]
    : [
        {
          source: 'ip-api.com',
          url: 'http://ip-api.com/json/?lang=zh-CN',
          readCity: (json) => String(json?.city || '').trim(),
          checkError: (json) => (json?.status === 'fail' ? String(json?.message || '定位失败') : ''),
        },
        {
          source: 'ipapi.co',
          url: 'https://ipapi.co/json/',
          readCity: (json) => String(json?.city || '').trim(),
          checkError: (json) => String(json?.error || '').trim(),
        },
      ]

  const errors = []
  for (const plan of lookupPlans) {
    try {
      const response = await fetch(plan.url, {
        headers: { 'User-Agent': 'even-dashboard/1.0' },
      })
      if (!response.ok) {
        errors.push(`${plan.source}: HTTP ${response.status}`)
        continue
      }
      const json = await response.json()
      const apiError = plan.checkError(json)
      if (apiError) {
        errors.push(`${plan.source}: ${apiError}`)
        continue
      }
      const city = plan.readCity(json)
      if (!city) {
        errors.push(`${plan.source}: 未返回城市`)
        continue
      }
      res.json({
        ok: true,
        city,
        ip: clientIp || null,
        source: plan.source,
      })
      return
    } catch (error) {
      errors.push(`${plan.source}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  res.status(200).json({
    ok: false,
    city: '',
    ip: clientIp || null,
    source: 'ipapi.co/ip-api.com',
    message: errors.length ? errors.join(' | ') : 'IP 定位失败',
  })
})

app.use('/api', api)

app.use(express.static(clientDistPath))

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'))
})

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  })
})

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`)
  console.log(
    'Routes: GET /api/health, POST /api/echo, POST /api/bills/import-stage, POST /api/bills/compute, POST /api/bills/import, POST /api/ai/chat',
  )
})
