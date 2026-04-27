const { CosmosClient } = require('@azure/cosmos')

const ASSET_DOC_ID = 'asset-manager'
const ASSET_PK = 'asset-manager'

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
    const client = new CosmosClient({
      endpoint: cfg.endpoint,
      key: cfg.key,
    })
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

function sanitizeAssetItem(item) {
  const id = String(item?.id || '').trim()
  const name = String(item?.name || '').trim()
  const amount = Number(item?.amount)
  if (!id) throw new Error('资产项缺少 id')
  if (!name) throw new Error('资产项缺少 name')
  if (!Number.isFinite(amount)) throw new Error(`资产项金额无效: ${id}`)
  return {
    id,
    name,
    note: item?.note ? String(item.note).trim() : undefined,
    amount,
    icon: String(item?.icon || '◎').trim() || '◎',
    tone: ['red', 'gold', 'blue', 'purple'].includes(String(item?.tone || 'blue'))
      ? String(item.tone)
      : 'blue',
  }
}

function sanitizeAssetGroup(group) {
  const id = String(group?.id || '').trim()
  const title = String(group?.title || '').trim()
  const rawItems = Array.isArray(group?.items) ? group.items : []
  if (!id) throw new Error('分组缺少 id')
  if (!title) throw new Error(`分组缺少 title: ${id}`)
  return {
    id,
    title,
    items: rawItems.map(sanitizeAssetItem),
  }
}

function sanitizeGroups(groups) {
  if (!Array.isArray(groups)) {
    throw new Error('groups 必须是数组')
  }
  return groups.map(sanitizeAssetGroup)
}

async function getAssets() {
  const container = await getCosmosContainer()
  let resource = null
  try {
    const result = await container.item(ASSET_DOC_ID, ASSET_PK).read()
    resource = result?.resource || null
  } catch (error) {
    const statusCode = Number(error?.code || error?.statusCode || 0)
    if (statusCode !== 404) {
      throw error
    }
  }

  if (!resource) {
    return {
      groups: [],
      updatedAt: null,
    }
  }

  return {
    groups: sanitizeGroups(resource.groups || []),
    updatedAt: resource.updatedAt || null,
  }
}

async function updateAssets(groups) {
  const sanitizedGroups = sanitizeGroups(groups)
  const container = await getCosmosContainer()
  const payload = {
    id: ASSET_DOC_ID,
    pk: ASSET_PK,
    groups: sanitizedGroups,
    updatedAt: new Date().toISOString(),
  }
  const result = await container.items.upsert(payload)
  return {
    groups: sanitizeGroups(result.resource?.groups || []),
    updatedAt: result.resource?.updatedAt || payload.updatedAt,
  }
}

module.exports = {
  getAssets,
  updateAssets,
}
