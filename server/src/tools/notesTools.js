const { z } = require('zod')
const { getNotes, createNote, updateNote, deleteNote } = require('../notesStore')
const { aiSearchNotes } = require('../notesAiSearch')

function preview(note) {
  const base = note.title || note.content.split('\n')[0] || '（空白记录）'
  return base.slice(0, 40)
}

function createListNotesTool(T) {
  return new T({
    name: 'list_notes',
    description: '列出全部备忘录的 id、标题/摘要与更新时间（不含完整内容）。需要某条全文时再用 get_note。',
    schema: z.object({}),
    func: async () => {
      const { notes } = await getNotes()
      if (!notes.length) return '当前没有备忘录。'
      const lines = notes.map((n) => `- ${preview(n)} (id: ${n.id}) | 更新于 ${n.updatedAt}`)
      return `共 ${notes.length} 条备忘录：\n${lines.join('\n')}`
    },
  })
}

function createGetNoteTool(T) {
  return new T({
    name: 'get_note',
    description: '读取某条备忘录的完整内容。调用前先用 list_notes 或 search_notes 获取 id。',
    schema: z.object({ id: z.string().describe('备忘录 id') }),
    func: async ({ id }) => {
      const { notes } = await getNotes()
      const note = notes.find((n) => n.id === id)
      if (!note) return `未找到 id 为 ${id} 的备忘录。`
      return `标题：${note.title || '（无标题）'}\n更新于：${note.updatedAt}\n\n${note.content}`
    },
  })
}

function createSearchNotesTool(T) {
  return new T({
    name: 'search_notes',
    description: '按自然语言语义搜索备忘录，返回最相关的若干条及匹配理由。用于“我之前记过…”这类回忆性问题。',
    schema: z.object({ query: z.string().describe('搜索意图，自然语言') }),
    func: async ({ query }) => {
      const { notes } = await getNotes()
      if (!notes.length) return '当前没有备忘录可供搜索。'
      const { results } = await aiSearchNotes(notes, query)
      if (!results || !results.length) return '没有找到相关备忘录。'
      const byId = new Map(notes.map((n) => [n.id, n]))
      const lines = results.map((r) => {
        const n = byId.get(r.id)
        return `- ${n ? preview(n) : r.id} (id: ${r.id})｜理由：${r.reason}`
      })
      return `找到 ${results.length} 条相关备忘录：\n${lines.join('\n')}`
    },
  })
}

function createAddNoteTool(T) {
  return new T({
    name: 'add_note',
    description: '新建一条备忘录。标题可选，内容必填。',
    schema: z.object({
      title: z.string().optional().describe('标题，可选'),
      content: z.string().describe('正文内容'),
    }),
    func: async ({ title, content }) => {
      const data = await createNote({ title: title || '', content })
      const saved = data.notes?.[0]
      return `已新建备忘录${title ? `「${title}」` : ''}（id: ${saved?.id || '未知'}）`
    },
  })
}

function createUpdateNoteTool(T) {
  return new T({
    name: 'update_note',
    description: '修改某条备忘录的标题或内容。调用前先用 list_notes / search_notes 获取 id。',
    schema: z.object({
      id: z.string(),
      title: z.string().optional(),
      content: z.string().optional(),
    }),
    func: async ({ id, title, content }) => {
      const patch = {}
      if (typeof title === 'string') patch.title = title
      if (typeof content === 'string') patch.content = content
      await updateNote(id, patch)
      return `已更新备忘录（id: ${id}）`
    },
  })
}

function createDeleteNoteTool(T) {
  return new T({
    name: 'delete_note',
    description: '删除某条备忘录。调用前先用 list_notes 获取 id。',
    schema: z.object({ id: z.string() }),
    func: async ({ id }) => {
      await deleteNote(id)
      return `已删除备忘录（id: ${id}）`
    },
  })
}

module.exports = {
  createListNotesTool,
  createGetNoteTool,
  createSearchNotesTool,
  createAddNoteTool,
  createUpdateNoteTool,
  createDeleteNoteTool,
}
