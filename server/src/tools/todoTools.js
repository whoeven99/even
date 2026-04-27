const { z } = require('zod')
const { getTodos, createTodo, updateTodo, deleteTodo } = require('../todoStore')

function createListTodosTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'list_todos',
    description: '读取当前待办事项列表。',
    schema: z.object({}),
    func: async () => {
      const data = await getTodos()
      const items = Array.isArray(data.items) ? data.items : []
      if (!items.length) return '当前没有待办事项。'
      const lines = items.map((item) => `- [${item.done ? 'x' : ' '}] ${item.id} | ${item.text}`)
      return `当前待办如下：\n${lines.join('\n')}`
    },
  })
}

function createAddTodoTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'add_todo',
    description: '新增一条待办事项。',
    schema: z.object({
      text: z.string().describe('待办内容'),
    }),
    func: async ({ text }) => {
      const data = await createTodo(text)
      return `已新增待办：${data.item.text}（id: ${data.item.id}）`
    },
  })
}

function createUpdateTodoTool(DynamicStructuredTool) {
  return new DynamicStructuredTool({
    name: 'update_todo',
    description:
      '更新待办事项。可修改文本(text)、完成状态(done)，或同时修改。调用前建议先 list_todos 获取 id。',
    schema: z.object({
      id: z.string().describe('待办 id'),
      text: z.string().optional().describe('新的待办内容，可选'),
      done: z.boolean().optional().describe('是否完成，可选'),
    }),
    func: async ({ id, text, done }) => {
      const patch = {}
      if (typeof text === 'string') patch.text = text
      if (typeof done === 'boolean') patch.done = done
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
