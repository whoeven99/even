const iconv = require('iconv-lite')
const { parse } = require('csv-parse/sync')

const CATEGORIES = ['餐饮', '购物', '日用', '住房', '汽车', '高速', '娱乐', '其他']

function decodeBillText(buffer) {
  const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '')
  if (/交易时间/.test(utf8) && /收\/支|收支/.test(utf8)) {
    return utf8
  }
  try {
    const gbk = iconv.decode(buffer, 'gbk')
    if (/交易时间/.test(gbk)) return gbk
  } catch {
    // ignore
  }
  return utf8
}

function extractCsvBlock(text) {
  const lines = text.split(/\r?\n/)
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('交易时间') && (line.includes('收/支') || line.includes('收支'))) {
      start = i
      break
    }
  }
  if (start === -1) {
    throw new Error(
      '未识别到微信账单表头（需包含「交易时间」「收/支」）。请导出「微信支付账单明细」CSV 后再上传。',
    )
  }
  return lines.slice(start).join('\n')
}

function normalizeRow(row) {
  const keys = Object.keys(row)
  const map = {}
  for (const k of keys) {
    const nk = String(k).replace(/^\uFEFF/, '').trim()
    map[nk] = row[k]
  }
  const time = map['交易时间'] ?? map['交易时间 '] ?? ''
  const type = map['交易类型'] ?? ''
  const peer = map['交易对方'] ?? ''
  const product = map['商品'] ?? ''
  const direction = (map['收/支'] ?? map['收支'] ?? '').trim()
  let amountRaw = map['金额(元)'] ?? map['金额（元）'] ?? map['金额'] ?? ''
  amountRaw = String(amountRaw).replace(/[¥￥,\s]/g, '').trim()
  const amount = Number.parseFloat(amountRaw)
  return {
    time: String(time).trim(),
    type: String(type).trim(),
    counterparty: String(peer).trim(),
    product: String(product).trim(),
    direction,
    amount: Number.isFinite(amount) ? amount : NaN,
    payment: String(map['支付方式'] ?? '').trim(),
    status: String(map['当前状态'] ?? '').trim(),
    remark: String(map['备注'] ?? '').trim(),
  }
}

function classifyTransaction(row) {
  const blob = `${row.counterparty}${row.product}${row.type}${row.remark}`

  if (/高速|ETC|路桥|通行费|收费站|粤通|苏通|浙通|通行宝/i.test(blob)) {
    return '高速'
  }
  if (
    /加油|石化|石油|壳牌|充电|停车|洗车|车险|4S|车管所|保养|维修|轮胎|代驾|滴滴.*车|曹操出行|高德打车|嘀嗒|哈啰.*车/i.test(
      blob,
    )
  ) {
    return '汽车'
  }
  if (/房租|物业|水电|电费|水费|燃气|宽带|供暖|宿舍|链家|自如|贝壳|小区/i.test(blob)) {
    return '住房'
  }
  if (/淘宝|天猫|京东|拼多多|唯品会|苏宁|得物|闲鱼|购物|旗舰店|商城|严选/i.test(blob)) {
    return '购物'
  }
  if (/电影|游戏|爱奇艺|优酷|腾讯.*会员|网易云|KTV|票务|娱乐|视频会员|B站|哔哩|Steam|网咖/i.test(blob)) {
    return '娱乐'
  }
  if (
    /美团|饿了么|外卖|餐厅|咖啡|奶茶|肯德基|麦当劳|星巴克|火锅|小吃|食堂|饭店|饮品|食品|生鲜|盒马|叮咚|朴朴|喜茶|奈雪|瑞幸|必胜客|海底捞|烧烤|面馆|酒楼|茶餐厅/i.test(
      blob,
    )
  ) {
    return '餐饮'
  }
  if (/全家|罗森|7-?11|711|便利|超市|日用|洗护|杂货|屈臣氏|名创|宜家|无印|DM|大润发|永辉|华润万家|沃尔玛|家乐福/i.test(blob)) {
    return '日用'
  }
  return '其他'
}

function parseAndClassify(buffer) {
  const text = decodeBillText(buffer)
  const csvBlock = extractCsvBlock(text)
  const records = parse(csvBlock, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  })

  const transactions = []
  const summaryByCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
  let expenseCount = 0
  let incomeTotal = 0
  let skipped = 0

  for (const raw of records) {
    const row = normalizeRow(raw)
    if (!row.time || Number.isNaN(row.amount)) {
      skipped += 1
      continue
    }
    const category = classifyTransaction(row)
    const isExpense = row.direction === '支出'
    const isIncome = row.direction === '收入'

    transactions.push({
      time: row.time,
      type: row.type,
      counterparty: row.counterparty,
      product: row.product,
      direction: row.direction,
      amount: row.amount,
      category,
      payment: row.payment,
      status: row.status,
    })

    if (isExpense) {
      summaryByCategory[category] = (summaryByCategory[category] || 0) + row.amount
      expenseCount += 1
    } else if (isIncome) {
      incomeTotal += row.amount
    }
  }

  const expenseTotal = Object.values(summaryByCategory).reduce((a, b) => a + b, 0)
  const monthHint =
    transactions.length > 0 && transactions[0].time
      ? transactions[0].time.slice(0, 7)
      : ''

  return {
    categories: CATEGORIES,
    transactions,
    summaryByCategory,
    meta: {
      expenseTotal: Math.round(expenseTotal * 100) / 100,
      incomeTotal: Math.round(incomeTotal * 100) / 100,
      expenseCount,
      transactionCount: transactions.length,
      skippedRows: skipped,
      monthHint,
    },
  }
}

module.exports = {
  parseAndClassify,
  CATEGORIES,
}
