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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
})

const app = express()
const PORT = Number(process.env.PORT) || 3000
const clientDistPath = path.resolve(__dirname, '../../client/dist')

app.use(cors())
app.use(express.json())

const api = express.Router()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
  const days = typeof daysRaw === 'string' ? Number(daysRaw) : 5
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
