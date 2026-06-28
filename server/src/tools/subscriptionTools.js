const { z } = require('zod')
const { getSubscriptions, updateSubscriptions } = require('../subscriptionStore')

const CATEGORIES = ['住房', '汽车', '数字服务', '还款', '其他']

function genId() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function toMonthly(item) {
  return item.cycle === 'monthly' ? item.amount : item.amount / 12
}

function createGetSubscriptionsTool(T) {
  return new T({
    name: 'get_subscriptions',
    description:
      '读取全部固定支出（订阅/账单）：每条的 id、名称、金额、周期(每月/每年)、分类，并附每月与每年的合计。分析固定支出或需要 id 时调用。',
    schema: z.object({}),
    func: async () => {
      const { items } = await getSubscriptions()
      if (!items.length) return '当前没有固定支出记录。'
      const monthly = items.reduce((s, i) => s + toMonthly(i), 0)
      const lines = items.map(
        (i) =>
          `- ${i.name} | ¥${i.amount}/${i.cycle === 'monthly' ? '月' : '年'} | ${i.category} (id: ${i.id})${i.note ? ' | ' + i.note : ''}`,
      )
      return `每月固定支出合计 ¥${monthly.toFixed(2)}，折合每年 ¥${(monthly * 12).toFixed(2)}\n\n${lines.join('\n')}`
    },
  })
}

function createAddSubscriptionTool(T) {
  return new T({
    name: 'add_subscription',
    description: '新增一条固定支出。分类可选：住房 / 汽车 / 数字服务 / 还款 / 其他。',
    schema: z.object({
      name: z.string().describe('支出名称'),
      amount: z.number().describe('金额'),
      cycle: z.enum(['monthly', 'yearly']).optional().describe('周期，默认 monthly'),
      category: z.enum(['住房', '汽车', '数字服务', '还款', '其他']).optional().describe('分类'),
      note: z.string().optional(),
    }),
    func: async ({ name, amount, cycle, category, note }) => {
      const { items } = await getSubscriptions()
      const item = {
        id: genId(),
        name,
        amount,
        cycle: cycle || 'monthly',
        category: category || '其他',
        note: note || undefined,
      }
      await updateSubscriptions([...items, item])
      return `已添加固定支出「${name}」¥${amount}/${item.cycle === 'monthly' ? '月' : '年'}（id: ${item.id}）`
    },
  })
}

function createUpdateSubscriptionTool(T) {
  return new T({
    name: 'update_subscription',
    description: '修改某条固定支出。调用前先用 get_subscriptions 获取 id。',
    schema: z.object({
      id: z.string(),
      name: z.string().optional(),
      amount: z.number().optional(),
      cycle: z.enum(['monthly', 'yearly']).optional(),
      category: z.enum(['住房', '汽车', '数字服务', '还款', '其他']).optional(),
      note: z.string().optional(),
    }),
    func: async ({ id, name, amount, cycle, category, note }) => {
      const { items } = await getSubscriptions()
      const item = items.find((i) => i.id === id)
      if (!item) return `未找到 id 为 ${id} 的固定支出，请先 get_subscriptions。`
      if (typeof name === 'string') item.name = name
      if (typeof amount === 'number') item.amount = amount
      if (cycle) item.cycle = cycle
      if (category) item.category = category
      if (typeof note === 'string') item.note = note || undefined
      await updateSubscriptions(items)
      return `已更新固定支出「${item.name}」¥${item.amount}/${item.cycle === 'monthly' ? '月' : '年'}`
    },
  })
}

function createDeleteSubscriptionTool(T) {
  return new T({
    name: 'delete_subscription',
    description: '删除某条固定支出。调用前先用 get_subscriptions 获取 id。',
    schema: z.object({ id: z.string() }),
    func: async ({ id }) => {
      const { items } = await getSubscriptions()
      const item = items.find((i) => i.id === id)
      if (!item) return `未找到 id 为 ${id} 的固定支出。`
      await updateSubscriptions(items.filter((i) => i.id !== id))
      return `已删除固定支出「${item.name}」`
    },
  })
}

module.exports = {
  createGetSubscriptionsTool,
  createAddSubscriptionTool,
  createUpdateSubscriptionTool,
  createDeleteSubscriptionTool,
  SUBSCRIPTION_CATEGORIES: CATEGORIES,
}
