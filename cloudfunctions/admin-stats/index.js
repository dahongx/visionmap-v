const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 运营统计：汇总用户数、生成次数、token、成本、收入、利润
// 用法：在云开发控制台「云端测试」直接执行（无需参数），返回汇总数据
exports.main = async (event = {}) => {
  try {
    const usersCol = db.collection('users')
    const usageCol = db.collection('usage_logs')

    // 1. 用户总数
    const userCountRes = await usersCol.count()
    const userCount = userCountRes.total

    // 2. 拉取所有 usage_logs（分页，每次最多100条）
    const totalRes = await usageCol.count()
    const total = totalRes.total
    const batchTimes = Math.ceil(total / 100)

    let logs = []
    for (let i = 0; i < batchTimes; i++) {
      const res = await usageCol.skip(i * 100).limit(100).get()
      logs = logs.concat(res.data)
    }

    // 3. 汇总
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalGptCost = 0       // 名义成本（GPT5.5基准）
    let totalMimoCost = 0      // 真实成本（mimo）
    let totalPoints = 0        // 扣的总积分
    let totalRevenue = 0       // 总收入（积分×单价）
    let totalRealProfit = 0    // 真实利润

    logs.forEach((log) => {
      totalInputTokens += Number(log.inputTokens) || 0
      totalOutputTokens += Number(log.outputTokens) || 0
      totalGptCost += Number(log.gptCostYuan) || 0
      totalMimoCost += Number(log.mimoCostYuan) || 0
      totalPoints += Number(log.pointsCharged) || 0
      totalRevenue += Number(log.revenueYuan) || 0
      totalRealProfit += Number(log.realProfitYuan) || 0
    })

    return {
      code: 0,
      data: {
        用户总数: userCount,
        生成总次数: total,
        总输入token: totalInputTokens,
        总输出token: totalOutputTokens,
        总token: totalInputTokens + totalOutputTokens,
        名义成本_GPT5_5基准: round2(totalGptCost) + ' 元',
        真实成本_mimo: round4(totalMimoCost) + ' 元',
        扣除总积分: totalPoints,
        总收入: round2(totalRevenue) + ' 元',
        真实利润: round2(totalRealProfit) + ' 元',
        平均每次扣积分: total > 0 ? Math.round(totalPoints / total) : 0,
        平均每次token: total > 0 ? Math.round((totalInputTokens + totalOutputTokens) / total) : 0
      }
    }
  } catch (err) {
    console.error('统计失败', err)
    return { code: -1, message: err.message || '统计失败' }
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function round4(n) {
  return Math.round(n * 10000) / 10000
}
