const { z } = require('zod')
const { getAssets, updateAssets } = require('../assetStore')

function genId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function summarize(groups) {
  const amounts = groups.flatMap((g) => g.items.map((i) => i.amount))
  const totalAsset = amounts.filter((a) => a > 0).reduce((s, a) => s + a, 0)
  const totalDebt = Math.abs(amounts.filter((a) => a < 0).reduce((s, a) => s + a, 0))
  return { totalAsset, totalDebt, netAsset: totalAsset - totalDebt }
}

function findItem(groups, id) {
  for (const g of groups) {
    const item = g.items.find((i) => i.id === id)
    if (item) return { group: g, item }
  }
  return null
}

function createGetAssetsTool(T) {
  return new T({
    name: 'get_assets',
    description:
      '读取全部资产与负债数据：每个分组及其下资产项的 id、名称、金额、备注，并附净资产/总资产/总负债汇总。分析财务状况或需要资产项 id 之前调用。',
    schema: z.object({}),
    func: async () => {
      const { groups } = await getAssets()
      if (!groups.length) return '当前没有任何资产或负债记录。'
      const { totalAsset, totalDebt, netAsset } = summarize(groups)
      const lines = []
      for (const g of groups) {
        lines.push(`【${g.title}】(groupId: ${g.id})`)
        for (const it of g.items) {
          lines.push(
            `  - ${it.name} | ${it.amount >= 0 ? '资产' : '负债'} ¥${it.amount} (id: ${it.id})${it.note ? ' | ' + it.note : ''}`,
          )
        }
        if (!g.items.length) lines.push('  （空分组）')
      }
      return `净资产 ¥${netAsset.toFixed(2)}（总资产 ¥${totalAsset.toFixed(2)} / 总负债 ¥${totalDebt.toFixed(2)}）\n\n${lines.join('\n')}`
    },
  })
}

function createAddAssetTool(T) {
  return new T({
    name: 'add_asset',
    description:
      '新增一个资产或负债项。负债请用负数金额。可指定已有分组 groupId，或用 groupTitle 归入/新建分组；都不填则归入“其他”。',
    schema: z.object({
      name: z.string().describe('资产/负债名称'),
      amount: z.number().describe('金额，负债填负数'),
      groupId: z.string().optional().describe('已有分组 id，可选'),
      groupTitle: z.string().optional().describe('分组名称，用于归入或新建分组，可选'),
      note: z.string().optional().describe('备注，可选'),
      icon: z.string().optional().describe('图标字符，可选'),
      tone: z.enum(['red', 'gold', 'blue', 'purple']).optional().describe('颜色，可选'),
    }),
    func: async ({ name, amount, groupId, groupTitle, note, icon, tone }) => {
      const { groups } = await getAssets()
      const newItem = {
        id: genId('asset'),
        name,
        amount,
        note: note || undefined,
        icon: icon || '◎',
        tone: tone || 'blue',
      }
      let target = null
      if (groupId) target = groups.find((g) => g.id === groupId) || null
      if (!target && groupTitle) target = groups.find((g) => g.title === groupTitle) || null
      if (!target) {
        const title = groupTitle || '其他'
        target = { id: genId('group'), title, items: [] }
        groups.push(target)
      }
      target.items.push(newItem)
      await updateAssets(groups)
      return `已添加「${name}」¥${amount} 至分组「${target.title}」(itemId: ${newItem.id})`
    },
  })
}

function createUpdateAssetTool(T) {
  return new T({
    name: 'update_asset',
    description: '修改某个资产/负债项的名称、金额或备注。调用前先用 get_assets 获取 id。',
    schema: z.object({
      id: z.string().describe('资产项 id'),
      name: z.string().optional(),
      amount: z.number().optional(),
      note: z.string().optional(),
    }),
    func: async ({ id, name, amount, note }) => {
      const { groups } = await getAssets()
      const found = findItem(groups, id)
      if (!found) return `未找到 id 为 ${id} 的资产项，请先 get_assets。`
      if (typeof name === 'string') found.item.name = name
      if (typeof amount === 'number') found.item.amount = amount
      if (typeof note === 'string') found.item.note = note || undefined
      await updateAssets(groups)
      return `已更新「${found.item.name}」金额 ¥${found.item.amount}`
    },
  })
}

function createDeleteAssetTool(T) {
  return new T({
    name: 'delete_asset',
    description: '删除某个资产/负债项。调用前先用 get_assets 获取 id。',
    schema: z.object({ id: z.string().describe('资产项 id') }),
    func: async ({ id }) => {
      const { groups } = await getAssets()
      const found = findItem(groups, id)
      if (!found) return `未找到 id 为 ${id} 的资产项。`
      found.group.items = found.group.items.filter((i) => i.id !== id)
      await updateAssets(groups)
      return `已删除资产项「${found.item.name}」`
    },
  })
}

module.exports = {
  createGetAssetsTool,
  createAddAssetTool,
  createUpdateAssetTool,
  createDeleteAssetTool,
}
