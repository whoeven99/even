/**
 * 启动阶段环境变量诊断日志。
 * 在 Render 上可通过 Secret Files (.env) 和 Environment Variables 两种方式注入变量，
 * 此模块在最早阶段打印所有关键变量的加载状态，方便排查两种注入方式是否同时生效。
 */
const fs = require('fs')
const path = require('path')

const TAG = '[env:startup]'

// ---- helpers ----

function maskValue(key, value) {
  if (value == null || value === '') return '(空)'
  const s = String(value)
  if (/token|secret|key|password|auth|connection/i.test(key)) {
    return `(已设置,len=${s.length})`
  }
  return s.length > 40 ? `${s.slice(0, 40)}…` : s
}

function okBadge(ok) {
  return ok ? '✅' : '❌'
}

function logEnvCheck(group, ok, pairs) {
  console.info(`${TAG} ${okBadge(ok)} ${group}`)
  for (const [k, v, fallback] of pairs) {
    const raw = v != null ? String(v) : ''
    const extra = fallback !== undefined && raw === '' ? ` (默认:${fallback})` : ''
    console.info(`${TAG}   ${k} = ${maskValue(k, raw)}${extra}`)
  }
}

// ---- Render Secret File 路径检查 ----

const RENDER_SECRET_PATHS = ['/etc/secrets/.env', '/etc/secrets/env']

function checkSecretFiles() {
  console.info(`${TAG} ===== Secret File 检查 =====`)
  const projectRoot = path.resolve(__dirname, '..')
  const candidates = [
    path.join(projectRoot, '.env'),
    path.join(process.cwd(), '.env'),
    ...RENDER_SECRET_PATHS,
  ]
  const seen = new Set()
  for (const fp of candidates) {
    const key = path.resolve(fp)
    if (seen.has(key)) continue
    seen.add(key)
    const exists = fs.existsSync(fp)
    const size = exists ? fs.statSync(fp).size : 0
    console.info(`${TAG}   ${fp} ${exists ? `存在 (${size} B)` : '不存在'}`)
  }
}

// ---- 关键变量诊断 ----

function logCriticalEnv() {
  console.info(`${TAG} ===== 关键变量 =====`)

  // Azure Cosmos DB
  const cosmosOk = Boolean(
    process.env.AZURE_COSMOS_ENDPOINT?.trim() &&
    process.env.AZURE_COSMOS_KEY?.trim() &&
    process.env.AZURE_COSMOS_DATABASE?.trim() &&
    process.env.AZURE_COSMOS_CONTAINER?.trim(),
  )
  logEnvCheck('Azure Cosmos DB', cosmosOk, [
    ['AZURE_COSMOS_ENDPOINT', process.env.AZURE_COSMOS_ENDPOINT],
    ['AZURE_COSMOS_KEY', process.env.AZURE_COSMOS_KEY],
    ['AZURE_COSMOS_DATABASE', process.env.AZURE_COSMOS_DATABASE],
    ['AZURE_COSMOS_CONTAINER', process.env.AZURE_COSMOS_CONTAINER],
  ])

  // Azure Blob Storage
  const blobOk = Boolean(
    process.env.AZURE_BLOB_CONNECTION_STRING?.trim() &&
    process.env.AZURE_BLOB_CONTAINER?.trim(),
  )
  logEnvCheck('Azure Blob', blobOk, [
    ['AZURE_BLOB_CONNECTION_STRING', process.env.AZURE_BLOB_CONNECTION_STRING],
    ['AZURE_BLOB_CONTAINER', process.env.AZURE_BLOB_CONTAINER],
  ])

  // LLM (DeepSeek / OpenAI)
  const llmKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || ''
  const llmModel = process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || ''
  const llmBase = process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || ''
  const llmOk = Boolean(llmKey.trim())
  logEnvCheck('LLM (DeepSeek/OpenAI)', llmOk, [
    ['DEEPSEEK_API_KEY', process.env.DEEPSEEK_API_KEY],
    ['OPENAI_API_KEY', process.env.OPENAI_API_KEY],
    ['DEEPSEEK_MODEL', process.env.DEEPSEEK_MODEL, 'deepseek-chat'],
    ['DEEPSEEK_BASE_URL', process.env.DEEPSEEK_BASE_URL, 'https://api.deepseek.com'],
  ])

  // App 配置
  const port = process.env.PORT || '3000'
  const nodeEnv = process.env.NODE_ENV || '(未设置)'
  const appEnv = process.env.APP_ENV || process.env.ENV || process.env.env || '(未设置)'
  logEnvCheck('App 配置', true, [
    ['PORT', port],
    ['NODE_ENV', nodeEnv],
    ['APP_ENV/ENV', appEnv],
    ['RENDER', process.env.RENDER || '(未设置,非Render环境)'],
    ['ACCESS_REQUIRE_PASSWORD', process.env.ACCESS_REQUIRE_PASSWORD, '非local时默认true'],
    ['ACCESS_PASSWORD', process.env.ACCESS_PASSWORD, '155010'],
  ])

  // 杂项
  const miscOk = true
  logEnvCheck('杂项', miscOk, [
    ['DEFAULT_WEATHER_CITY', process.env.DEFAULT_WEATHER_CITY, '杭州'],
    ['BILL_STAGE_TTL_MS', process.env.BILL_STAGE_TTL_MS],
  ])
}

// ---- 主入口 ----

let envLogged = false

function logStartupEnv() {
  if (envLogged) return
  envLogged = true

  console.info(`${TAG} NODE_ENV=${process.env.NODE_ENV || '(未设置)'}, RENDER=${process.env.RENDER || '否'}, cwd=${process.cwd()}`)
  console.info(`${TAG} Node ${process.version}, pid=${process.pid}`)

  checkSecretFiles()
  logCriticalEnv()

  console.info(`${TAG} process.env 总键数: ${Object.keys(process.env).length}`)
  console.info(`${TAG} ===== 环境诊断完成 =====`)
}

module.exports = { logStartupEnv }
