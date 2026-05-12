const { randomUUID } = require('crypto')
const { CosmosClient } = require('@azure/cosmos')

const TODO_DOC_ID = 'home-todos'
const TODO_PK = 'home-todos'

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

function sanitizeTodoText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    throw new Error('待办内容不能为空')
  }
  if (normalized.length > 120) {
    throw new Error('待办内容不能超过 120 个字符')
  }
  return normalized
}

function normalizeTodoTime(time, fallbackIso) {
  if (time === undefined || time === null || String(time).trim() === '') {
    return fallbackIso
  }
  const parsed = new Date(String(time))
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('时间格式不正确')
  }
  return parsed.toISOString()
}

function buildTodayStartIso() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

function sanitizeTodoItem(item) {
  const id = String(item?.id || '').trim()
  const text = String(item?.text || '').trim()
  if (!id || !text) return null
  const parsedOrder = Number(item?.order)
  const order = Number.isFinite(parsedOrder) ? parsedOrder : null
  const time =
    typeof item?.time === 'string' && item.time.trim()
      ? item.time.trim()
      : String(item?.createdAt || item?.updatedAt || '')
  return {
    id,
    text,
    done: Boolean(item?.done),
    createdAt: String(item?.createdAt || ''),
    updatedAt: String(item?.updatedAt || ''),
    time,
    order,
  }
}

async function readTodoDoc() {
  const container = await getCosmosContainer()
  try {
    const result = await container.item(TODO_DOC_ID, TODO_PK).read()
    const resource = result?.resource || null
    if (!resource) return { container, doc: null }
    const items = Array.isArray(resource.items)
      ? resource.items.map(sanitizeTodoItem).filter(Boolean)
      : []
    return {
      container,
      doc: {
        id: TODO_DOC_ID,
        pk: TODO_PK,
        items,
        updatedAt: String(resource.updatedAt || ''),
      },
    }
  } catch (error) {
    const code = Number(error?.code || error?.statusCode || 0)
    if (code === 404) {
      return { container, doc: null }
    }
    throw error
  }
}

function sortTodos(items) {
  return [...items]
    .sort((a, b) => {
      const timeA = new Date(String(a.time || a.createdAt || a.updatedAt || '')).getTime()
      const timeB = new Date(String(b.time || b.createdAt || b.updatedAt || '')).getTime()
      const validA = Number.isFinite(timeA)
      const validB = Number.isFinite(timeB)
      if (validA && validB && timeA !== timeB) return timeA - timeB
      if (validA !== validB) return validA ? -1 : 1
      if (a.done !== b.done) return a.done ? 1 : -1
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    })
    .map((item, index) => ({
      ...item,
      order: index,
    }))
}

async function getTodos() {
  const { doc } = await readTodoDoc()
  return {
    items: doc ? sortTodos(doc.items) : [],
    updatedAt: doc?.updatedAt || null,
  }
}

async function createTodo(text, time) {
  const normalizedText = sanitizeTodoText(text)
  const { container, doc } = await readTodoDoc()
  const now = new Date().toISOString()
  const normalizedTime = normalizeTodoTime(time, buildTodayStartIso())
  const sortedExisting = sortTodos(doc?.items || [])
  const nextItem = {
    id: `todo-${Date.now()}-${randomUUID().slice(0, 8)}`,
    text: normalizedText,
    done: false,
    time: normalizedTime,
    createdAt: now,
    updatedAt: now,
    order: -1,
  }
  const nextItems = sortTodos([...sortedExisting, nextItem])
  const payload = {
    id: TODO_DOC_ID,
    pk: TODO_PK,
    items: nextItems,
    updatedAt: now,
  }
  const result = await container.items.upsert(payload)
  const resourceItems = Array.isArray(result?.resource?.items) ? result.resource.items : nextItems
  return {
    item: nextItem,
    items: sortTodos(resourceItems.map(sanitizeTodoItem).filter(Boolean)),
    updatedAt: result?.resource?.updatedAt || now,
  }
}

async function updateTodo(todoId, patch) {
  const id = String(todoId || '').trim()
  if (!id) throw new Error('todoId 不能为空')

  const { container, doc } = await readTodoDoc()
  if (!doc) throw new Error('待办不存在')

  const index = doc.items.findIndex((item) => item.id === id)
  if (index < 0) throw new Error('待办不存在')

  const current = doc.items[index]
  const now = new Date().toISOString()
  const nextItem = {
    ...current,
    text:
      Object.prototype.hasOwnProperty.call(patch, 'text')
        ? sanitizeTodoText(patch.text)
        : current.text,
    done:
      Object.prototype.hasOwnProperty.call(patch, 'done')
        ? Boolean(patch.done)
        : current.done,
    time:
      Object.prototype.hasOwnProperty.call(patch, 'time')
        ? normalizeTodoTime(patch.time, current.time || now)
        : current.time || now,
    updatedAt: now,
  }

  const nextItems = sortTodos([...doc.items])
  const sortedIndex = nextItems.findIndex((item) => item.id === id)
  if (sortedIndex < 0) throw new Error('待办不存在')
  const sortedCurrent = nextItems[sortedIndex]
  nextItems[sortedIndex] = {
    ...sortedCurrent,
    ...nextItem,
    order: sortedCurrent.order,
  }
  const payload = {
    id: TODO_DOC_ID,
    pk: TODO_PK,
    items: sortTodos(nextItems),
    updatedAt: now,
  }
  const result = await container.items.upsert(payload)
  const resourceItems = Array.isArray(result?.resource?.items) ? result.resource.items : payload.items
  return {
    item: nextItem,
    items: sortTodos(resourceItems.map(sanitizeTodoItem).filter(Boolean)),
    updatedAt: result?.resource?.updatedAt || now,
  }
}

async function deleteTodo(todoId) {
  const id = String(todoId || '').trim()
  if (!id) throw new Error('todoId 不能为空')

  const { container, doc } = await readTodoDoc()
  if (!doc) throw new Error('待办不存在')

  const nextItems = sortTodos(doc.items).filter((item) => item.id !== id)
  if (nextItems.length === doc.items.length) {
    throw new Error('待办不存在')
  }
  const now = new Date().toISOString()
  const payload = {
    id: TODO_DOC_ID,
    pk: TODO_PK,
    items: sortTodos(nextItems),
    updatedAt: now,
  }
  const result = await container.items.upsert(payload)
  const resourceItems = Array.isArray(result?.resource?.items) ? result.resource.items : payload.items
  return {
    deletedId: id,
    items: sortTodos(resourceItems.map(sanitizeTodoItem).filter(Boolean)),
    updatedAt: result?.resource?.updatedAt || now,
  }
}

async function reorderTodos(orderedIds) {
  const ids = Array.isArray(orderedIds)
    ? orderedIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  if (!ids.length) {
    throw new Error('orderedIds 不能为空')
  }

  const { container, doc } = await readTodoDoc()
  if (!doc) throw new Error('待办不存在')

  const sortedItems = sortTodos(doc.items)
  if (ids.length !== sortedItems.length) {
    throw new Error('orderedIds 数量与待办数量不一致')
  }
  const unique = new Set(ids)
  if (unique.size !== ids.length) {
    throw new Error('orderedIds 不能包含重复 id')
  }

  const itemById = new Map(sortedItems.map((item) => [item.id, item]))
  const missingIds = ids.filter((id) => !itemById.has(id))
  if (missingIds.length) {
    throw new Error(`orderedIds 包含无效 id: ${missingIds.join(', ')}`)
  }
  const extraIds = sortedItems.map((item) => item.id).filter((id) => !unique.has(id))
  if (extraIds.length) {
    throw new Error(`orderedIds 缺少 id: ${extraIds.join(', ')}`)
  }

  const nextItems = ids.map((id, index) => ({
    ...itemById.get(id),
    order: index,
  }))
  const now = new Date().toISOString()
  const payload = {
    id: TODO_DOC_ID,
    pk: TODO_PK,
    items: nextItems,
    updatedAt: now,
  }
  const result = await container.items.upsert(payload)
  const resourceItems = Array.isArray(result?.resource?.items) ? result.resource.items : payload.items
  return {
    items: sortTodos(resourceItems.map(sanitizeTodoItem).filter(Boolean)),
    updatedAt: result?.resource?.updatedAt || now,
  }
}

module.exports = {
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  reorderTodos,
}
