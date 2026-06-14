const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// ============================================================
//  计费配置区（你可以随时改这几个数）
// ============================================================
// 成本基准：用 GPT-5.5 对外价当"名义成本"，保证以后换模型也有利润
const USD_TO_CNY = 7.2                       // 美元汇率
const GPT_INPUT_USD_PER_M = 5                 // GPT-5.5 输入 $5/百万token
const GPT_OUTPUT_USD_PER_M = 30              // GPT-5.5 输出 $30/百万token
const INPUT_COST_PER_TOKEN = (GPT_INPUT_USD_PER_M / 1000000) * USD_TO_CNY   // ¥/token
const OUTPUT_COST_PER_TOKEN = (GPT_OUTPUT_USD_PER_M / 1000000) * USD_TO_CNY // ¥/token

// mimo 真实成本（包月套餐折算，用于台账看真实利润）
// Standard ¥99/月 = 11B Credits；mimo-v2.5 输入100 Credit/token，输出200 Credit/token
const MIMO_CNY_PER_CREDIT = 99 / 11000000000  // 每 Credit 多少元
const MIMO_INPUT_COST_PER_TOKEN = 100 * MIMO_CNY_PER_CREDIT
const MIMO_OUTPUT_COST_PER_TOKEN = 200 * MIMO_CNY_PER_CREDIT

const PROFIT_RATE = 5.0      // 利润倍率，500%利润 = 收成本的 (1+5)=6 倍
const POINT_PRICE_CNY = 0.1  // 1 积分 = ¥0.1（卡密定价）
const MIN_POINTS = 10        // 最低消费 10 积分
// 不封顶：token 越多扣越多，累加
// ============================================================

const MIN_BALANCE_TO_GENERATE = 10  // 低于这个积分不允许生成

exports.main = async (event, context) => {
  const { fileID } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log('=== analyze-image 开始 ===')
  console.log('fileID:', fileID)
  console.log('openid:', openid)

  if (!openid) {
    return { code: -1, message: '无法获取用户身份，请重新进入小程序' }
  }

  if (!fileID) {
    return { code: -1, message: '缺少图片文件ID' }
  }

  const db = cloud.database()
  const _ = db.command
  const usersCollection = db.collection('users')
  const recordsCollection = db.collection('records')

  try {
    // 1. 生成前检查积分：不足直接拦截，不调用 AI（成本=0）
    const user = await ensureUser(db, usersCollection, openid)
    const currentPoints = Number(user.points) || 0
    console.log('当前积分:', currentPoints)

    if (currentPoints < MIN_BALANCE_TO_GENERATE) {
      return {
        code: 1001,  // 1001 = 积分不足
        message: `积分不足，至少需要 ${MIN_BALANCE_TO_GENERATE} 积分`,
        data: { points: currentPoints, required: MIN_BALANCE_TO_GENERATE }
      }
    }

    // 2. 创建记录（处理中）
    const addRes = await recordsCollection.add({
      data: {
        userId: openid,
        type: 'image',
        sourceUrl: fileID,
        title: '图片识别中',
        resultJson: {},
        status: 'processing',
        pointsCost: 0,
        createdAt: db.serverDate()
      }
    })
    const recordId = addRes._id
    console.log('记录创建成功，recordId:', recordId)

    try {
      // 3. 调 AI 识别（拿到 token 用量）
      const { mindmapData, usage } = await processImage(fileID)

      // 4. 按 token 计算应扣积分
      const billing = calcPoints(usage)
      console.log('计费结果:', JSON.stringify(billing))

      // 5. 扣积分（原子操作，防并发；二次校验余额）
      const freshUser = await usersCollection.doc(openid).get()
      const balance = Number(freshUser.data.points) || 0
      const charge = Math.min(billing.points, balance)  // 余额不够就扣到0（不会负）

      await usersCollection.doc(openid).update({
        data: {
          points: _.inc(-charge),
          updatedAt: db.serverDate()
        }
      })

      // 6. 记积分流水
      await db.collection('point_logs').add({
        data: {
          userId: openid,
          change: -charge,
          reason: '手写笔记转导图',
          createdAt: db.serverDate()
        }
      })

      // 7. 记成本台账（usage_logs）
      await db.collection('usage_logs').add({
        data: {
          userId: openid,
          recordId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.inputTokens + usage.outputTokens,
          gptCostYuan: billing.gptCost,          // 按GPT5.5算的名义成本
          mimoCostYuan: billing.mimoCost,        // mimo真实成本
          pointsCharged: charge,                 // 实际扣的积分
          revenueYuan: charge * POINT_PRICE_CNY, // 这些积分值多少钱
          realProfitYuan: charge * POINT_PRICE_CNY - billing.mimoCost, // 真实利润
          createdAt: db.serverDate()
        }
      })

      // 8. 更新记录为完成
      await recordsCollection.doc(recordId).update({
        data: {
          title: mindmapData.text || '未命名导图',
          resultJson: _.set(mindmapData),
          status: 'completed',
          pointsCost: charge,
          completedAt: db.serverDate()
        }
      })

      console.log('图片分析完成，扣积分:', charge)
      return {
        code: 0,
        data: {
          _id: recordId,
          status: 'completed',
          resultJson: mindmapData,
          pointsCharged: charge,            // 本次扣了多少积分（前端弹窗用）
          pointsBalance: balance - charge   // 扣完后余额
        }
      }
    } catch (processErr) {
      console.error('处理图片失败:', processErr)
      // AI 失败：不扣分，标记失败
      await recordsCollection.doc(recordId).update({
        data: {
          status: 'failed',
          error: processErr.message || '图片分析失败',
          completedAt: db.serverDate()
        }
      })
      return {
        code: -1,
        message: processErr.message || '图片分析失败',
        data: { _id: recordId, status: 'failed' }
      }
    }
  } catch (err) {
    console.error('analyze-image 失败:', err)
    return { code: -1, message: err.message || '生成失败' }
  }
}

// 计算应扣积分
function calcPoints(usage) {
  const input = usage.inputTokens || 0
  const output = usage.outputTokens || 0

  // 名义成本（GPT5.5 基准）
  const gptCost = input * INPUT_COST_PER_TOKEN + output * OUTPUT_COST_PER_TOKEN
  // 真实成本（mimo）
  const mimoCost = input * MIMO_INPUT_COST_PER_TOKEN + output * MIMO_OUTPUT_COST_PER_TOKEN

  // 售价 = 名义成本 × (1+利润倍率)
  const priceYuan = gptCost * (1 + PROFIT_RATE)
  // 换算积分，不封顶，最低 MIN_POINTS
  const points = Math.max(MIN_POINTS, Math.ceil(priceYuan / POINT_PRICE_CNY))

  return {
    points,
    gptCost: round4(gptCost),
    mimoCost: round4(mimoCost),
    priceYuan: round4(priceYuan)
  }
}

function round4(n) {
  return Math.round(n * 10000) / 10000
}

// 确保用户存在（不存在则建档送50分）
async function ensureUser(db, usersCollection, openid) {
  try {
    const res = await usersCollection.doc(openid).get()
    if (res.data) return res.data
  } catch (err) {
    // 不存在，继续创建
  }
  const user = {
    _id: openid,
    points: 50,
    nickName: '',
    avatarUrl: '',
    lastSignIn: '',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }
  try {
    await usersCollection.doc(openid).set({ data: user })
    await db.collection('point_logs').add({
      data: { userId: openid, change: 50, reason: '新用户注册赠送', createdAt: db.serverDate() }
    })
  } catch (err) {
    const res = await usersCollection.doc(openid).get()
    return res.data || user
  }
  return user
}

// 调用 AI 识别图片，返回 mindmap 数据和 token 用量
async function processImage(fileID) {
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('未配置 ANTHROPIC_AUTH_TOKEN 环境变量')
  }

  console.log('正在下载图片...')
  const fileRes = await cloud.downloadFile({ fileID })
  const imageBuffer = fileRes.fileContent
  const base64Image = imageBuffer.toString('base64')
  console.log('图片下载成功，大小:', imageBuffer.length, 'bytes')

  console.log('正在调用AI API...')
  const startTime = Date.now()
  const response = await axios.post(
    'https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages',
    {
      model: 'mimo-v2.5',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64Image }
          },
          {
            type: 'text',
            text: `请分析这张图片的内容，并将其转换为结构化的思维导图数据格式。

要求：
1. 识别图片中的主要内容和层级关系
2. 输出为JSON格式，包含以下结构：
{
  "text": "根节点文本",
  "children": [
    {
      "text": "子节点文本",
      "children": [...]
    }
  ]
}
3. 层级关系要清晰，每个节点都要有text字段
4. 不要添加额外的解释，只输出JSON`
          }
        ]
      }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 45000
    }
  )

  const apiTime = Date.now() - startTime
  console.log('AI API调用完成，耗时:', apiTime, 'ms')

  // 读取 token 用量（Anthropic 标准格式 usage.input_tokens / output_tokens）
  const usageRaw = response.data.usage || {}
  const usage = {
    inputTokens: Number(usageRaw.input_tokens) || 0,
    outputTokens: Number(usageRaw.output_tokens) || 0
  }
  console.log('token用量:', JSON.stringify(usage))

  const content = response.data.content[0].text
  console.log('AI返回内容长度:', content.length)

  const mindmapData = normalizeMindmapData(parseMindmapJson(content))
  return { mindmapData, usage }
}

function parseMindmapJson(content) {
  try {
    return JSON.parse(content)
  } catch (e) {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    throw new Error('无法解析AI返回的数据')
  }
}

function normalizeMindmapData(data) {
  const ensureNode = (node, index = 0) => {
    const normalized = node && typeof node === 'object' ? node : {}
    normalized.id = normalized.id || `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`
    normalized.text = normalized.text || '未命名'

    if (!Array.isArray(normalized.children)) {
      normalized.children = []
    }

    normalized.children = normalized.children.map((child, childIndex) => {
      return ensureNode(child, childIndex)
    })

    return normalized
  }

  return ensureNode(data)
}
