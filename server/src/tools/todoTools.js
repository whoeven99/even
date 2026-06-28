const { z } = require('zod')
const { getTodos, createTodo, updateTodo, deleteTodo } = require('../todoStore')

function createListTodosTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'list_todos',
    description: '读取当前待办事项列表，包含 id、内容、完成状态、置顶/隐藏状态与设定时间。',
    schema: z.object({}),
    func: async () => {
      const data = await getTodos()
      const items = Array.isArray(data.items) ? data.items : []
      if (!items.length) return '当前没有待办事项。'
      const lines = items.map((item) => {
        const flags = [item.pinned ? '置顶' : '', item.hidden ? '隐藏' : ''].filter(Boolean).join('/')
        return `- [${item.done ? 'x' : ' '}] ${item.id} | ${item.text}${item.time ? ' | ' + item.time : ''}${flags ? ' | ' + flags : ''}`
      })
      return `当前待办如下：\n${lines.join('\n')}`
    },
  })
}

function createAddTodoTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'add_todo',
    description: '新增一条待办事项，可指定截止时间。',
    schema: z.object({
      text: z.string().describe('待办内容'),
      time: z
        .string()
        .optional()
        .describe('截止时间，ISO 字符串或可被 Date 解析的时间，可选'),
    }),
    func: async ({ text, time }) => {
      const data = await createTodo(text, time)
      return `已新增待办：${data.item.text}（id: ${data.item.id}）${data.item.time ? `，时间 ${data.item.time}` : ''}`
    },
  })
}

function createUpdateTodoTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'update_todo',
    description:
      '更新待办事项，可修改文本(text)、完成状态(done)、时间(time)、置顶(pinned)、隐藏(hidden)。调用前建议先 list_todos 获取 id。',
    schema: z.object({
      id: z.string().describe('待办 id'),
      text: z.string().optional().describe('新的待办内容'),
      done: z.boolean().optional().describe('是否完成'),
      time: z.string().optional().describe('截止时间，ISO 字符串'),
      pinned: z.boolean().optional().describe('是否置顶'),
      hidden: z.boolean().optional().describe('是否隐藏'),
    }),
    func: async ({ id, text, done, time, pinned, hidden }) => {
      const patch = {}
      if (typeof text === 'string') patch.text = text
      if (typeof done === 'boolean') patch.done = done
      if (typeof time === 'string') patch.time = time
      if (typeof pinned === 'boolean') patch.pinned = pinned
      if (typeof hidden === 'boolean') patch.hidden = hidden
      const data = await updateTodo(id, patch)
      return `已更新待办：${data.item.text}（${data.item.done ? '已完成' : '未完成'}）`
    },
  })
}

function createDeleteTodoTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'delete_todo',
    description: '删除待办事项。调用前建议先 list_todos 获取 id。',
    schema: z.object({
      id: z.string().describe('待办 id'),
    }),
    func: async ({ id }) => {
      await deleteTodo(id)
      return `已删除待办（id: ${id}）`
    },
  })
}

module.exports = {
  createListTodosTool,
  createAddTodoTool,
  createUpdateTodoTool,
  createDeleteTodoTool,
}
