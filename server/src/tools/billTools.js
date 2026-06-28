const { z } = require('zod')
const { listBillStages, computeBillFromStage } = require('../billAiParse')

function monthOf(stage) {
  const m = String(stage.stageId).match(/(20\d{2})[-_/]?([01]\d)/)
  if (m) return `${m[1]}-${m[2]}`
  if (Number.isFinite(stage.createdAt)) {
    const d = new Date(stage.createdAt)
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
  }
  return '未知月份'
}

function createListBillMonthsTool(T) {
  return new T({
    name: 'list_bill_months',
    description:
      '列出已导入的微信账单月份及其 stageId。需要分析某个月的消费前，先用本工具拿到 stageId。',
    schema: z.object({}),
    func: async () => {
      const stages = await listBillStages(30)
      if (!stages.length) return '还没有导入任何微信账单。请先到“财务中心-账单分析”上传账单。'
      const lines = stages.map((s) => `- ${monthOf(s)} | ${s.rowCount} 笔 (stageId: ${s.stageId})`)
      return `已导入的账单：\n${lines.join('\n')}`
    },
  })
}

function createAnalyzeBillMonthTool(T) {
  return new T({
    name: 'analyze_bill_month',
    description:
      '分析某一期账单的消费：收入/支出合计、交易笔数、各分类支出分布，以及金额最高的若干笔支出。需先用 list_bill_months 获取 stageId。',
    schema: z.object({
      stageId: z.string().describe('账单暂存 id，来自 list_bill_months'),
      topN: z.number().optional().describe('返回金额最高的支出笔数，默认 5'),
    }),
    func: async ({ stageId, topN }) => {
      const result = await computeBillFromStage(stageId)
      const meta = result.meta || {}
      const summary = result.summaryByCategory || {}
      const n = Math.min(Math.max(Number(topN) || 5, 1), 20)

      const catLines = Object.entries(summary)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `  - ${k}: ¥${Number(v).toFixed(2)}`)

      const topExpenses = (result.transactions || [])
        .filter((t) => t.direction === '支出')
        .sort((a, b) => b.amount - a.amount)
        .slice(0, n)
        .map((t) => `  - ¥${t.amount.toFixed(2)} | ${t.category} | ${t.counterparty}${t.product ? ' / ' + t.product : ''}`)

      return [
        `账单期：${monthOf({ stageId, createdAt: 0 })}`,
        `支出合计 ¥${Number(meta.expenseTotal || 0).toFixed(2)}，收入合计 ¥${Number(meta.incomeTotal || 0).toFixed(2)}，共 ${meta.transactionCount || 0} 笔`,
        '',
        '分类支出分布：',
        catLines.length ? catLines.join('\n') : '  （无支出）',
        '',
        `金额最高的 ${n} 笔支出：`,
        topExpenses.length ? topExpenses.join('\n') : '  （无）',
      ].join('\n')
    },
  })
}

module.exports = {
  createListBillMonthsTool,
  createAnalyzeBillMonthTool,
}
