const { CosmosClient } = require('@azure/cosmos')

const DOC_ID = 'notes-store'
const DOC_PK = 'notes-store'

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
    if (!ok) throw new Error('Cosmos 配置不完整：请检查 endpoint/key/database/container')
    const client = new CosmosClient({ endpoint: cfg.endpoint, key: cfg.key })
    const database = client.database(cfg.database)
    await database.read()
    const container = database.container(cfg.container)
    await container.read()
    return container
  })().catch((err) => {
    cosmosContainerPromise = null
    throw err
  })
  return cosmosContainerPromise
}

function sanitizeNote(note) {
  const id = String(note?.id || '').trim()
  const title = String(note?.title || '').trim()
  const content = String(note?.content || '').trim()
  if (!id) throw new Error('笔记缺少 id')
  if (!content && !title) throw new Error('笔记标题与内容不能同时为空')
  return {
    id,
    title,
    content,
    createdAt: String(note?.createdAt || new Date().toISOString()),
    updatedAt: String(note?.updatedAt || new Date().toISOString()),
  }
}

function sanitizeNotes(notes) {
  if (!Array.isArray(notes)) return []
  return notes.map(sanitizeNote)
}

async function getDoc() {
  const container = await getCosmosContainer()
  try {
    const result = await container.item(DOC_ID, DOC_PK).read()
    return result?.resource || null
  } catch (err) {
    if (Number(err?.code || err?.statusCode) === 404) return null
    throw err
  }
}

async function persistNotes(notes) {
  const sanitized = sanitizeNotes(notes)
  sanitized.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const container = await getCosmosContainer()
  const payload = {
    id: DOC_ID,
    pk: DOC_PK,
    notes: sanitized,
    updatedAt: new Date().toISOString(),
  }
  const result = await container.items.upsert(payload)
  const saved = sanitizeNotes(result.resource?.notes || [])
  saved.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { notes: saved }
}

async function getNotes() {
  const doc = await getDoc()
  const notes = sanitizeNotes(doc?.notes || [])
  notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { notes }
}

async function createNote(data) {
  const { notes } = await getNotes()
  const now = new Date().toISOString()
  const note = sanitizeNote({
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: String(data?.title || '').trim(),
    content: String(data?.content || '').trim(),
    createdAt: now,
    updatedAt: now,
  })
  return persistNotes([note, ...notes])
}

async function updateNote(id, patch) {
  const { notes } = await getNotes()
  const idx = notes.findIndex((n) => n.id === id)
  if (idx === -1) throw new Error(`笔记不存在: ${id}`)
  const updated = sanitizeNote({
    ...notes[idx],
    ...(patch?.title !== undefined ? { title: patch.title } : {}),
    ...(patch?.content !== undefined ? { content: patch.content } : {}),
    id: notes[idx].id,
    createdAt: notes[idx].createdAt,
    updatedAt: new Date().toISOString(),
  })
  const next = [...notes]
  next[idx] = updated
  return persistNotes(next)
}

async function deleteNote(id) {
  const { notes } = await getNotes()
  const filtered = notes.filter((n) => n.id !== id)
  if (filtered.length === notes.length) throw new Error(`笔记不存在: ${id}`)
  return persistNotes(filtered)
}

module.exports = { getNotes, createNote, updateNote, deleteNote }
