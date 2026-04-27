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

function sanitizeTodoItem(item) {
  const id = String(item?.id || '').trim()
  const text = String(item?.text || '').trim()
  if (!id || !text) return null
  return {
    id,
    text,
    done: Boolean(item?.done),
    createdAt: String(item?.createdAt || ''),
    updatedAt: String(item?.updatedAt || ''),
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
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  })
}

async function getTodos() {
  const { doc } = await readTodoDoc()
  return {
    items: doc ? sortTodos(doc.items) : [],
    updatedAt: doc?.updatedAt || null,
  }
}

async function createTodo(text) {
  const normalizedText = sanitizeTodoText(text)
  const { container, doc } = await readTodoDoc()
  const now = new Date().toISOString()
  const nextItem = {
    id: `todo-${Date.now()}-${randomUUID().slice(0, 8)}`,
    text: normalizedText,
    done: false,
    createdAt: now,
    updatedAt: now,
  }
  const nextItems = sortTodos([...(doc?.items || []), nextItem])
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
    updatedAt: now,
  }

  const nextItems = [...doc.items]
  nextItems[index] = nextItem
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

  const nextItems = doc.items.filter((item) => item.id !== id)
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

module.exports = {
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
}
