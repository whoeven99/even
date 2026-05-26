const { CosmosClient } = require('@azure/cosmos')

const SUBS_DOC_ID = 'subscription-manager'
const SUBS_PK = 'subscription-manager'

let cosmosContainerPromise = null

function getCosmosConfig() {
  return {
    endpoint: process.env.AZURE_COSMOS_ENDPOINT || '',
    key: process.env.AZURE_COSMOS_KEY || '',
    database: process.env.AZURE_COSMOS_DATABASE || '',
    container: process.env.AZURE_COSMOS_CONTAINER || '',
  }
}

async function getCosmosContainer() {
  if (cosmosContainerPromise) return cosmosContainerPromise
  cosmosContainerPromise = (async () => {
    const cfg = getCosmosConfig()
    const ok = cfg.endpoint && cfg.key && cfg.database && cfg.container
    if (!ok) {
      throw new Error('Cosmos 配置不完整：请检查 endpoint/key/database/container')
    }
    const client = new CosmosClient({ endpoint: cfg.endpoint, key: cfg.key })
    const database = client.database(cfg.database)
    await database.read()
    const container = database.container(cfg.container)
    await container.read()
    return container
  })().catch((error) => {
    cosmosContainerPromise = null
    throw error
  })
  return cosmosContainerPromise
}

function sanitizeSubscription(item) {
  const id = String(item?.id || '').trim()
  const name = String(item?.name || '').trim()
  const amount = Number(item?.amount)
  const cycle = ['monthly', 'yearly'].includes(String(item?.cycle || 'monthly'))
    ? String(item.cycle)
    : 'monthly'
  if (!id) throw new Error('订阅项缺少 id')
  if (!name) throw new Error('订阅项缺少 name')
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`订阅金额无效: ${id}`)
  return {
    id,
    name,
    amount,
    cycle,
    note: item?.note ? String(item.note).trim() : undefined,
  }
}

function sanitizeSubscriptions(items) {
  if (!Array.isArray(items)) throw new Error('items 必须是数组')
  return items.map(sanitizeSubscription)
}

async function getSubscriptions() {
  const container = await getCosmosContainer()
  let resource = null
  try {
    const result = await container.item(SUBS_DOC_ID, SUBS_PK).read()
    resource = result?.resource || null
  } catch (error) {
    const statusCode = Number(error?.code || error?.statusCode || 0)
    if (statusCode !== 404) throw error
  }

  if (!resource) {
    return { items: [], updatedAt: null }
  }

  return {
    items: sanitizeSubscriptions(resource.items || []),
    updatedAt: resource.updatedAt || null,
  }
}

async function updateSubscriptions(items) {
  const sanitized = sanitizeSubscriptions(items)
  const container = await getCosmosContainer()
  const payload = {
    id: SUBS_DOC_ID,
    pk: SUBS_PK,
    items: sanitized,
    updatedAt: new Date().toISOString(),
  }
  const result = await container.items.upsert(payload)
  return {
    items: sanitizeSubscriptions(result.resource?.items || []),
    updatedAt: result.resource?.updatedAt || payload.updatedAt,
  }
}

module.exports = { getSubscriptions, updateSubscriptions }
