const iconv = require('iconv-lite')
const { BlobServiceClient } = require('@azure/storage-blob')
const { CosmosClient } = require('@azure/cosmos')
const { parse } = require('csv-parse/sync')

const CATEGORIES = ['餐饮', '购物', '日用', '住房', '汽车', '高速', '娱乐', '其他']
const STAGE_TTL_MS = 30 * 60 * 1000
const stageStore = new Map()
const AZURE_STAGE_PREFIX = 'bill-stages'

let azureClientsPromise = null
let hasLoggedAzureReady = false
let lastStageWriteStatus = {
  at: null,
  stageId: null,
  storageMode: 'none',
  rowCount: 0,
  chunkCount: 1,
  sourceLineCount: 0,
}

function formatAzureInitError(error, cfg) {
  const statusCode = Number(error?.code || error?.statusCode || 0)
  const rawMessage = error instanceof Error ? error.message : String(error)
  if (statusCode === 404 || /Resource Not Found/i.test(rawMessage)) {
    return (
      `Cosmos 资源不存在：请确认 Database="${cfg.cosmosDatabase}"、` +
      `Container="${cfg.cosmosContainer}" 已在账号中创建，且分区键为 /pk。`
    )
  }
  if (/throughput limit|RU\/s/i.test(rawMessage)) {
    return 'Cosmos 吞吐上限不足（RU 限制）。请降低自动创建操作或提升账户 RU 上限。'
  }
  return rawMessage
}

function getStageStoreConfig() {
  return {
    ttlMs: Number(process.env.BILL_STAGE_TTL_MS || STAGE_TTL_MS),
    blobConnectionString: process.env.AZURE_BLOB_CONNECTION_STRING || '',
    blobContainer: process.env.AZURE_BLOB_CONTAINER || '',
    cosmosEndpoint: process.env.AZURE_COSMOS_ENDPOINT || '',
    cosmosKey: process.env.AZURE_COSMOS_KEY || '',
    cosmosDatabase: process.env.AZURE_COSMOS_DATABASE || '',
    cosmosContainer: process.env.AZURE_COSMOS_CONTAINER || '',
  }
}

async function getAzureClients() {
  if (azureClientsPromise) return azureClientsPromise
  azureClientsPromise = (async () => {
    const cfg = getStageStoreConfig()
    const hasBlob = cfg.blobConnectionString && cfg.blobContainer
    const hasCosmos =
      cfg.cosmosEndpoint && cfg.cosmosKey && cfg.cosmosDatabase && cfg.cosmosContainer
    if (!hasBlob || !hasCosmos) {
      console.warn('[bill-storage] Azure config incomplete, fallback to memory store')
      return { enabled: false, reason: 'blob_or_cosmos_missing' }
    }

    const blobService = BlobServiceClient.fromConnectionString(
      cfg.blobConnectionString,
    )
    const containerClient = blobService.getContainerClient(cfg.blobContainer)
    await containerClient.createIfNotExists()

    const cosmos = new CosmosClient({
      endpoint: cfg.cosmosEndpoint,
      key: cfg.cosmosKey,
    })
    const database = cosmos.database(cfg.cosmosDatabase)
    await database.read()
    const container = database.container(cfg.cosmosContainer)
    await container.read()

    if (!hasLoggedAzureReady) {
      console.log(
        `[bill-storage] Azure ready. blob=${cfg.blobContainer}, cosmos=${cfg.cosmosDatabase}/${cfg.cosmosContainer}`,
      )
      hasLoggedAzureReady = true
    }
    return { enabled: true, containerClient, cosmosContainer: container, ttlMs: cfg.ttlMs }
  })().catch((error) => {
    const cfg = getStageStoreConfig()
    const friendly = formatAzureInitError(error, cfg)
    console.error('[bill-storage] Azure init failed, fallback to memory:', friendly)
    azureClientsPromise = null
    throw new Error(friendly)
  })
  return azureClientsPromise
}

function decodeBillLikeText(buffer) {
  const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '')
  const bad = (utf8.match(/\uFFFD/g) || []).length
  if (bad === 0 || bad < utf8.length * 0.02) return utf8
  try {
    return iconv.decode(buffer, 'gbk')
  } catch {
    return utf8
  }
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '')
    .replace(/[:：]/g, '')
    .trim()
}

function normalizeDirection(raw) {
  const s = String(raw || '').trim()
  if (/支出|扣款|付款|出账|Out|Debit|DR/i.test(s) && !/收入/.test(s)) return '支出'
  if (/收入|入账|退款收入|In|Credit|CR/i.test(s)) return '收入'
  if (s === '收/支' || s === '') return '其他'
  return s.includes('支') ? '支出' : s.includes('入') ? '收入' : '其他'
}

function parseAmount(raw) {
  const cleaned = String(raw || '')
    .replace(/[¥￥,\s]/g, '')
    .replace(/[()]/g, '')
    .trim()
  if (!cleaned) return NaN
  const amount = Number.parseFloat(cleaned)
  return Number.isFinite(amount) ? Math.abs(amount) : NaN
}

function formatDateTimeUtc(date) {
  const p2 = (n) => String(n).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}-${p2(date.getUTCMonth() + 1)}-${p2(date.getUTCDate())} ` +
    `${p2(date.getUTCHours())}:${p2(date.getUTCMinutes())}:${p2(date.getUTCSeconds())}`
  )
}

function normalizeTimeValue(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return formatDateTimeUtc(raw)
  }
  const text = String(raw ?? '').trim()
  if (!text) return ''

  // Excel 序列日期（如 46113.594...），按 1899-12-30 基准换算。
  const maybeNum = Number(text)
  if (Number.isFinite(maybeNum) && maybeNum > 20000 && maybeNum < 80000) {
    const wholeDays = Math.floor(maybeNum)
    const dayFraction = maybeNum - wholeDays
    const base = Date.UTC(1899, 11, 30)
    const ms = wholeDays * 24 * 60 * 60 * 1000 + Math.round(dayFraction * 24 * 60 * 60 * 1000)
    return formatDateTimeUtc(new Date(base + ms))
  }
  return text
}

function getColumnIndex(headers, aliases) {
  for (let i = 0; i < headers.length; i += 1) {
    const h = normalizeHeader(headers[i])
    if (aliases.some((a) => h.includes(a))) return i
  }
  return -1
}

function classifyTransaction(row) {
  const blob = `${row.counterparty}${row.product}${row.type}${row.remark || ''}`
  if (/高速|ETC|路桥|通行费|收费站|粤通|苏通|浙通|通行宝/i.test(blob)) return '高速'
  if (
    /加油|石化|石油|壳牌|充电|停车|洗车|车险|4S|车管所|保养|维修|轮胎|代驾|滴滴.*车|曹操出行|高德打车|嘀嗒|哈啰.*车/i.test(
      blob,
    )
  ) {
    return '汽车'
  }
  if (/房租|物业|水电|电费|水费|燃气|宽带|供暖|宿舍|链家|自如|贝壳|小区/i.test(blob)) {
    return '住房'
  }
  if (/淘宝|天猫|京东|拼多多|唯品会|苏宁|得物|闲鱼|购物|旗舰店|商城|严选/i.test(blob)) {
    return '购物'
  }
  if (/电影|游戏|爱奇艺|优酷|腾讯.*会员|网易云|KTV|票务|娱乐|视频会员|B站|哔哩|Steam|网咖/i.test(blob)) {
    return '娱乐'
  }
  if (
    /美团|饿了么|外卖|餐厅|咖啡|奶茶|肯德基|麦当劳|星巴克|火锅|小吃|食堂|饭店|饮品|食品|生鲜|盒马|叮咚|朴朴|喜茶|奈雪|瑞幸|必胜客|海底捞|烧烤|面馆|酒楼|茶餐厅/i.test(
      blob,
    )
  ) {
    return '餐饮'
  }
  if (/全家|罗森|7-?11|711|便利|超市|日用|洗护|杂货|屈臣氏|名创|宜家|无印|DM|大润发|永辉|华润万家|沃尔玛|家乐福/i.test(blob)) {
    return '日用'
  }
  return '其他'
}

function inferMonthKeyFromRows(rows) {
  for (const row of rows) {
    const time = String(row.time || '').trim()
    const m = time.match(/(\d{4})[-/](\d{1,2})/)
    if (m) {
      const year = m[1]
      const month = String(Number(m[2])).padStart(2, '0')
      return `${year}-${month}`
    }
  }
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function inferMonthKeyFromTimeValue(timeValue) {
  const time = String(timeValue || '').trim()
  const m = time.match(/(\d{4})[-/](\d{1,2})/)
  if (m) {
    return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`
  }
  return ''
}

function splitRowsByMonth(rows) {
  const groups = new Map()
  for (const row of rows) {
    const monthKey = inferMonthKeyFromTimeValue(row.time) || inferMonthKeyFromRows([row])
    if (!groups.has(monthKey)) {
      groups.set(monthKey, [])
    }
    groups.get(monthKey).push(row)
  }
  return Array.from(groups.entries())
    .map(([monthKey, monthRows]) => ({ monthKey, rows: monthRows }))
    .sort((a, b) => String(b.monthKey).localeCompare(String(a.monthKey)))
}

function parseRowsFromSheet(rows2d) {
  if (!rows2d.length) return []
  const maxScan = Math.min(40, rows2d.length)
  let headerIdx = -1
  let idx = {}
  for (let i = 0; i < maxScan; i += 1) {
    const row = rows2d[i] || []
    const time = getColumnIndex(row, ['交易时间', '交易日期', '时间'])
    const amount = getColumnIndex(row, ['金额(元)', '金额（元）', '金额', '订单金额'])
    const direction = getColumnIndex(row, ['收/支', '收支', '资金方向'])
    if (time >= 0 && amount >= 0 && (direction >= 0 || getColumnIndex(row, ['交易类型']) >= 0)) {
      headerIdx = i
      idx = {
        time,
        amount,
        direction,
        type: getColumnIndex(row, ['交易类型', '类型']),
        counterparty: getColumnIndex(row, ['交易对方', '对方', '商户']),
        product: getColumnIndex(row, ['商品', '商品名称', '交易单号说明']),
        payment: getColumnIndex(row, ['支付方式']),
        status: getColumnIndex(row, ['当前状态', '状态']),
        remark: getColumnIndex(row, ['备注']),
      }
      break
    }
  }
  if (headerIdx < 0) return []

  const out = []
  for (let i = headerIdx + 1; i < rows2d.length; i += 1) {
    const row = rows2d[i] || []
    const time = idx.time >= 0 ? normalizeTimeValue(row[idx.time]) : ''
    const amount = idx.amount >= 0 ? parseAmount(row[idx.amount]) : NaN
    if (!time || !Number.isFinite(amount)) continue
    const direction = idx.direction >= 0 ? String(row[idx.direction] ?? '').trim() : ''
    out.push({
      time,
      type: idx.type >= 0 ? String(row[idx.type] ?? '').trim() : '',
      counterparty: idx.counterparty >= 0 ? String(row[idx.counterparty] ?? '').trim() : '',
      product: idx.product >= 0 ? String(row[idx.product] ?? '').trim() : '',
      direction,
      amount,
      payment: idx.payment >= 0 ? String(row[idx.payment] ?? '').trim() : '',
      status: idx.status >= 0 ? String(row[idx.status] ?? '').trim() : '',
      remark: idx.remark >= 0 ? String(row[idx.remark] ?? '').trim() : '',
    })
  }
  return out
}

function extractRowsDeterministic(buffer, originalname = '') {
  const name = String(originalname || '').toLowerCase()
  const allRows = []
  let sourceLineCount = 0

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = require('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      sourceLineCount += rows2d.length
      allRows.push(...parseRowsFromSheet(rows2d))
    }
  } else {
    const text = decodeBillLikeText(buffer)
    const records = parse(text, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: false,
    })
    sourceLineCount = records.length
    allRows.push(...parseRowsFromSheet(records))
  }

  if (!allRows.length) {
    throw new Error(
      '未能从文件中识别到有效交易行。请确认上传的是微信账单源文件（CSV/Excel）且包含交易时间与金额列。',
    )
  }
  return { rows: allRows, sourceLineCount }
}

function cleanupExpiredStages() {
  const now = Date.now()
  const ttlMs = Number(process.env.BILL_STAGE_TTL_MS || STAGE_TTL_MS)
  for (const [id, s] of stageStore.entries()) {
    if (now - s.createdAt > ttlMs) stageStore.delete(id)
  }
}

function finalizeFromRows(rows, stageId) {
  const summaryByCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
  let incomeTotal = 0
  let expenseCount = 0
  let skipped = 0
  const transactions = []

  for (const row of rows) {
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      skipped += 1
      continue
    }
    const direction = normalizeDirection(row.direction)
    const category = classifyTransaction(row)
    transactions.push({
      time: String(row.time || '').trim(),
      type: String(row.type || '').trim(),
      counterparty: String(row.counterparty || '').trim(),
      product: String(row.product || '').trim(),
      direction,
      amount: Math.round(amount * 100) / 100,
      category,
      payment: String(row.payment || '').trim(),
      status: String(row.status || '').trim(),
    })
    if (direction === '支出') {
      summaryByCategory[category] = (summaryByCategory[category] || 0) + amount
      expenseCount += 1
    } else if (direction === '收入') {
      incomeTotal += amount
    }
  }

  const expenseTotal = Object.values(summaryByCategory).reduce((a, b) => a + b, 0)
  const monthHint =
    transactions.length > 0 && /^\d{4}-\d{2}/.test(transactions[0].time)
      ? transactions[0].time.slice(0, 7)
      : ''

  return {
    stageId,
    categories: CATEGORIES,
    transactions,
    summaryByCategory,
    meta: {
      expenseTotal: Math.round(expenseTotal * 100) / 100,
      incomeTotal: Math.round(incomeTotal * 100) / 100,
      expenseCount,
      transactionCount: transactions.length,
      skippedRows: skipped,
      invalidAiLines: 0,
      monthHint,
      parseMode: 'rule-full',
    },
  }
}

async function createBillStageFromUpload(buffer, originalname) {
  cleanupExpiredStages()
  const { rows, sourceLineCount } = extractRowsDeterministic(buffer, originalname)
  const monthGroups = splitRowsByMonth(rows)
  const fallbackMonthKey = inferMonthKeyFromRows(rows)
  const groups = monthGroups.length
    ? monthGroups
    : [{ monthKey: fallbackMonthKey, rows }]
  const cfg = getStageStoreConfig()
  const createdAt = Date.now()
  let azure = null
  try {
    azure = await getAzureClients()
  } catch {
    azure = null
  }

  const createdStages = []
  for (const group of groups) {
    const monthKey = group.monthKey
    const stageId = monthKey
    const groupRows = group.rows
    const groupSourceLineCount = groupRows.length
    const blobName = `${AZURE_STAGE_PREFIX}/${stageId}.json`
    let storageMode = 'memory'

    try {
      if (azure?.enabled) {
        const payload = JSON.stringify({
          stageId,
          createdAt,
          originalname: originalname || '',
          rows: groupRows,
          sourceLineCount: groupSourceLineCount,
        })
        await azure.containerClient
          .getBlockBlobClient(blobName)
          .upload(payload, Buffer.byteLength(payload), {
            blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' },
          })
        await azure.cosmosContainer.items.upsert({
          id: stageId,
          pk: 'bill-stage',
          stageId,
          createdAt,
          originalname: originalname || '',
          blobName,
          sourceLineCount: groupSourceLineCount,
          rowCount: groupRows.length,
          mode: 'azure',
        })
        storageMode = 'azure'
      } else {
        stageStore.set(stageId, {
          stageId,
          createdAt,
          rows: groupRows,
          originalname: originalname || '',
          sourceLineCount: groupSourceLineCount,
        })
      }
    } catch {
      stageStore.set(stageId, {
        stageId,
        createdAt,
        rows: groupRows,
        originalname: originalname || '',
        sourceLineCount: groupSourceLineCount,
      })
      storageMode = 'memory-fallback'
    }

    createdStages.push({
      stageId,
      monthKey,
      rowCount: groupRows.length,
      invalidAiLines: 0,
      chunkCount: 1,
      sourceLineCount: groupSourceLineCount,
      expiresInMs: cfg.ttlMs,
      storageMode,
    })
  }

  const primaryStage = createdStages[0]
  lastStageWriteStatus = {
    at: new Date().toISOString(),
    stageId: primaryStage?.stageId || null,
    storageMode: primaryStage?.storageMode || 'memory',
    rowCount: primaryStage?.rowCount || 0,
    chunkCount: 1,
    sourceLineCount,
  }

  return {
    ...(primaryStage || {
      stageId: fallbackMonthKey,
      monthKey: fallbackMonthKey,
      rowCount: rows.length,
      invalidAiLines: 0,
      chunkCount: 1,
      sourceLineCount,
      expiresInMs: cfg.ttlMs,
      storageMode: 'memory',
    }),
    stageCount: createdStages.length,
    createdStages,
    sourceLineCount,
  }
}

async function computeBillFromStage(stageId) {
  cleanupExpiredStages()
  let stage = stageStore.get(stageId)
  if (!stage) {
    try {
      const azure = await getAzureClients()
      if (azure.enabled) {
        let resource = null
        try {
          const byPk = await azure.cosmosContainer.item(stageId, 'bill-stage').read()
          resource = byPk.resource || null
        } catch {
          // ignore and query by id
        }
        if (!resource) {
          const result = await azure.cosmosContainer.items
            .query({
              query: 'SELECT TOP 1 * FROM c WHERE c.id = @id',
              parameters: [{ name: '@id', value: stageId }],
            })
            .fetchAll()
          resource = result.resources?.[0] || null
        }
        if (resource?.blobName) {
          const blobClient = azure.containerClient.getBlobClient(String(resource.blobName))
          const download = await blobClient.download()
          const text = await streamToString(download.readableStreamBody)
          const parsed = JSON.parse(text)
          stage = {
            stageId: parsed.stageId || stageId,
            createdAt: Number(parsed.createdAt || Date.now()),
            rows: Array.isArray(parsed.rows) ? parsed.rows : [],
            originalname: String(parsed.originalname || ''),
            sourceLineCount: Number(parsed.sourceLineCount || 0),
          }
        }
      }
    } catch {
      // ignore
    }
  }
  if (!stage) {
    throw new Error('暂存数据不存在、已过期或存储不可用，请重新上传账单')
  }
  return finalizeFromRows(stage.rows, stageId)
}

async function importAndCompute(buffer, originalname) {
  const staged = await createBillStageFromUpload(buffer, originalname)
  const computed = await computeBillFromStage(staged.stageId)
  return {
    ...computed,
    stageInfo: staged,
  }
}

async function streamToString(readable) {
  if (!readable) return ''
  const chunks = []
  return new Promise((resolve, reject) => {
    readable.on('data', (data) => chunks.push(Buffer.from(data)))
    readable.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    readable.on('error', reject)
  })
}

async function getStorageStatus() {
  const cfg = getStageStoreConfig()
  const hasBlobConfig = Boolean(cfg.blobConnectionString && cfg.blobContainer)
  const hasCosmosConfig = Boolean(
    cfg.cosmosEndpoint && cfg.cosmosKey && cfg.cosmosDatabase && cfg.cosmosContainer,
  )
  let azureEnabled = false
  let azureReason = ''
  try {
    const azure = await getAzureClients()
    azureEnabled = Boolean(azure.enabled)
    azureReason = azure.enabled ? 'ok' : String(azure.reason || 'disabled')
  } catch (error) {
    azureEnabled = false
    azureReason = error instanceof Error ? error.message : 'init_failed'
  }
  return {
    hasBlobConfig,
    hasCosmosConfig,
    azureEnabled,
    azureReason,
    inMemoryStageCount: stageStore.size,
    lastStageWriteStatus,
  }
}

async function listBillStages(limit = 20) {
  cleanupExpiredStages()
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
  const result = []

  for (const value of stageStore.values()) {
    result.push({
      stageId: value.stageId,
      createdAt: value.createdAt,
      storageMode: 'memory',
      rowCount: Array.isArray(value.rows) ? value.rows.length : 0,
      sourceLineCount: Number(value.sourceLineCount || 0),
    })
  }

  try {
    const azure = await getAzureClients()
    if (azure.enabled) {
      const query = await azure.cosmosContainer.items
        .query({
          query:
            'SELECT TOP @limit c.id, c.stageId, c.createdAt, c.rowCount, c.sourceLineCount, c.mode FROM c WHERE c.pk = @pk ORDER BY c.createdAt DESC',
          parameters: [
            { name: '@limit', value: safeLimit },
            { name: '@pk', value: 'bill-stage' },
          ],
        })
        .fetchAll()
      for (const item of query.resources || []) {
        result.push({
          stageId: String(item.stageId || item.id || ''),
          createdAt: Number(item.createdAt || 0),
          storageMode: String(item.mode || 'azure'),
          rowCount: Number(item.rowCount || 0),
          sourceLineCount: Number(item.sourceLineCount || 0),
        })
      }
    }
  } catch {
    // ignore azure list errors and return what we have
  }

  const dedup = new Map()
  for (const item of result) {
    if (!item.stageId) continue
    const prev = dedup.get(item.stageId)
    if (!prev || Number(item.createdAt || 0) > Number(prev.createdAt || 0)) {
      dedup.set(item.stageId, item)
    }
  }

  return Array.from(dedup.values())
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, safeLimit)
}

async function deleteBillStage(stageId) {
  cleanupExpiredStages()
  const normalizedStageId = String(stageId || '').trim()
  if (!normalizedStageId) {
    throw new Error('stageId 不能为空')
  }

  const deletedMemory = stageStore.delete(normalizedStageId)
  let deletedBlob = false
  let deletedRecord = false

  try {
    const azure = await getAzureClients()
    if (azure.enabled) {
      const query = await azure.cosmosContainer.items
        .query({
          query:
            'SELECT c.id, c.pk, c.stageId, c.blobName FROM c WHERE c.pk = @pk AND (c.id = @id OR c.stageId = @stageId)',
          parameters: [
            { name: '@pk', value: 'bill-stage' },
            { name: '@id', value: normalizedStageId },
            { name: '@stageId', value: normalizedStageId },
          ],
        })
        .fetchAll()

      const resources = Array.isArray(query.resources) ? query.resources : []
      const blobNames = new Set([`${AZURE_STAGE_PREFIX}/${normalizedStageId}.json`])
      for (const item of resources) {
        if (item?.blobName) blobNames.add(String(item.blobName))
      }

      for (const blobName of blobNames) {
        try {
          const deleted = await azure.containerClient
            .getBlockBlobClient(String(blobName))
            .deleteIfExists({ deleteSnapshots: 'include' })
          if (deleted?.succeeded) deletedBlob = true
        } catch {
          // ignore blob delete errors
        }
      }

      for (const item of resources) {
        const recordId = String(item?.id || '')
        const recordPk = String(item?.pk || 'bill-stage')
        if (!recordId) continue
        try {
          await azure.cosmosContainer.item(recordId, recordPk).delete()
          deletedRecord = true
        } catch {
          // ignore single record delete errors, continue others
        }
      }
    }
  } catch {
    // ignore azure client errors, memory delete already attempted
  }

  return {
    stageId: normalizedStageId,
    deleted: deletedMemory || deletedBlob || deletedRecord,
    deletedMemory,
    deletedBlob,
    deletedRecord,
  }
}

module.exports = {
  createBillStageFromUpload,
  computeBillFromStage,
  importAndCompute,
  getStorageStatus,
  listBillStages,
  deleteBillStage,
  CATEGORIES,
}
