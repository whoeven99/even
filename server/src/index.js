require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')

const app = express()
const PORT = Number(process.env.PORT) || 3000
const clientDistPath = path.resolve(__dirname, '../../client/dist')

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
  })
})

app.post('/api/echo', (req, res) => {
  res.json({
    ok: true,
    received: req.body ?? null,
  })
})

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
})
