const { randomUUID } = require('crypto')
const { CosmosClient } = require('@azure/cosmos')

const SUB_DOC_ID = 'home-subscriptions'
const SUB_PK = 'home-subscriptions'

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

function sanitizeSubscriptionItem(item) {
  const id = String(item?.id || '').trim()
  const name = String(item?.name || '').trim()
  if (!id || !name) return null
  const amount = Number(item?.amount)
  const cycle = item?.cycle === 'yearly' ? 'yearly' : 'monthly'
  const currency = String(item?.currency || 'CNY').trim().toUpperCase() || 'CNY'
  const note = String(item?.note || '').trim()
  const active = item?.active !== false
  return {
    id,
    name,
    amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    cycle,
    currency,
    note,
    active,
    createdAt: String(item?.createdAt || ''),
    updatedAt: String(item?.updatedAt || ''),
  }
}

async function readSubDoc() {
  const container = await getCosmosContainer()
  try {
    const result = await container.item(SUB_DOC_ID, SUB_PK).read()
    const resource = result?.resource || null
    if (!resource) return { container, doc: null }
    const items = Array.isArray(resource.items)
      ? resource.items.map(sanitizeSubscriptionItem).filter(Boolean)
      : []
    return {
      container,
      doc: {
        id: SUB_DOC_ID,
        pk: SUB_PK,
        items,
        updatedAt: String(resource.updatedAt || ''),
      },
    }
  } catch (error) {
    const code = Number(error?.code || error?.statusCode || 0)
    if (code === 404) return { container, doc: null }
    throw error
  }
}

function sortSubscriptions(items) {
  return [...items].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const timeA = new Date(String(a.createdAt || '')).getTime()
    const timeB = new Date(String(b.createdAt || '')).getTime()
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return timeA - timeB
    return String(a.name).localeCompare(String(b.name))
  })
}

async function getSubscriptions() {
  const { doc } = await readSubDoc()
  return {
    items: doc ? sortSubscriptions(doc.items) : [],
    updatedAt: doc?.updatedAt || null,
  }
}

async function createSubscription(data) {
  const name = String(data?.name || '').trim()
  if (!name) throw new Error('订阅名称不能为空')
  if (name.length > 80) throw new Error('订阅名称不能超过 80 个字符')

  const amount = Number(data?.amount)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('费用必须为非负数')

  const cycle = data?.cycle === 'yearly' ? 'yearly' : 'monthly'
  const currency = String(data?.currency || 'CNY').trim().toUpperCase() || 'CNY'
  const note = String(data?.note || '').trim().slice(0, 200)

  const { container, doc } = await readSubDoc()
  const now = new Date().toISOString()
  const newItem = {
    id: `sub-${Date.now()}-${randomUUID().slice(0, 8)}`,
    name,
    amount,
    cycle,
    currency,
    note,
    active: true,
    createdAt: now,
    updatedAt: now,
  }
  const nextItems = sortSubscriptions([...(doc?.items || []), newItem])
  const payload = { id: SUB_DOC_ID, pk: SUB_PK, items: nextItems, updatedAt: now }
  const result = await container.items.upsert(payload)
  const resourceItems = Array.isArray(result?.resource?.items) ? result.resource.items : nextItems
  return {
    item: newItem,
    items: sortSubscriptions(resourceItems.map(sanitizeSubscriptionItem).filter(Boolean)),
    updatedAt: result?.resource?.updatedAt || now,
  }
}

async function updateSubscription(subId, patch) {
  const id = String(subId || '').trim()
  if (!id) throw new Error('subscriptionId 不能为空')

  const { container, doc } = await readSubDoc()
  if (!doc) throw new Error('订阅不存在')

  const index = doc.items.findIndex((item) => item.id === id)
  if (index < 0) throw new Error('订阅不存在')

  const current = doc.items[index]
  const now = new Date().toISOString()

  let name = current.name
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    name = String(patch.name || '').trim()
    if (!name) throw new Error('订阅名称不能为空')
    if (name.length > 80) throw new Error('订阅名称不能超过 80 个字符')
  }

  let amount = current.amount
  if (Object.prototype.hasOwnProperty.call(patch, 'amount')) {
    amount = Number(patch.amount)
    if (!Number.isFinite(amount) || amount < 0) throw new Error('费用必须为非负数')
  }

  const nextItem = {
    ...current,
    name,
    amount,
    cycle: Object.prototype.hasOwnProperty.call(patch, 'cycle')
      ? patch.cycle === 'yearly' ? 'yearly' : 'monthly'
      : current.cycle,
    currency: Object.prototype.hasOwnProperty.call(patch, 'currency')
      ? String(patch.currency || 'CNY').trim().toUpperCase() || 'CNY'
      : current.currency,
    note: Object.prototype.hasOwnProperty.call(patch, 'note')
      ? String(patch.note || '').trim().slice(0, 200)
      : current.note,
    active: Object.prototype.hasOwnProperty.call(patch, 'active')
      ? patch.active !== false
      : current.active,
    updatedAt: now,
  }

  const nextItems = [...doc.items]
  nextItems[index] = nextItem
  const payload = { id: SUB_DOC_ID, pk: SUB_PK, items: sortSubscriptions(nextItems), updatedAt: now }
  const result = await container.items.upsert(payload)
  const resourceItems = Array.isArray(result?.resource?.items) ? result.resource.items : payload.items
  return {
    item: nextItem,
    items: sortSubscriptions(resourceItems.map(sanitizeSubscriptionItem).filter(Boolean)),
    updatedAt: result?.resource?.updatedAt || now,
  }
}

async function deleteSubscription(subId) {
  const id = String(subId || '').trim()
  if (!id) throw new Error('subscriptionId 不能为空')

  const { container, doc } = await readSubDoc()
  if (!doc) throw new Error('订阅不存在')

  const nextItems = doc.items.filter((item) => item.id !== id)
  if (nextItems.length === doc.items.length) throw new Error('订阅不存在')

  const now = new Date().toISOString()
  const payload = { id: SUB_DOC_ID, pk: SUB_PK, items: sortSubscriptions(nextItems), updatedAt: now }
  const result = await container.items.upsert(payload)
  const resourceItems = Array.isArray(result?.resource?.items) ? result.resource.items : payload.items
  return {
    deletedId: id,
    items: sortSubscriptions(resourceItems.map(sanitizeSubscriptionItem).filter(Boolean)),
    updatedAt: result?.resource?.updatedAt || now,
  }
}

module.exports = {
  getSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
}
