const cloud = require('wx-server-sdk')
const axios = require('axios')
const pdf = require('pdf-parse')
const mammoth = require('mammoth')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { fileID, fileType } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!fileID) {
    return {
      code: -1,
      message: '缺少文档文件ID'
    }
  }

  if (!fileType) {
    return {
      code: -1,
      message: '缺少文档类型'
    }
  }

  try {
    const db = cloud.database()
    const _ = db.command
    const recordsCollection = db.collection('records')

    const addRes = await recordsCollection.add({
      data: {
        userId: openid,
        type: fileType,
        sourceUrl: fileID,
        title: '文档识别中',
        resultJson: {},
        status: 'processing',
        pointsCost: 15,
        createdAt: db.serverDate()
      }
    })

    const recordId = addRes._id

    try {
      const mindmapData = await processDocument(fileID, fileType)

      await recordsCollection.doc(recordId).update({
        data: {
          title: mindmapData.text || '未命名导图',
          resultJson: _.set(mindmapData),
          status: 'completed',
          completedAt: db.serverDate()
        }
      })

      console.log('文档分析完成，记录ID:', recordId)
      return {
        code: 0,
        data: {
          _id: recordId,
          status: 'completed',
          resultJson: mindmapData
        }
      }
    } catch (processErr) {
      console.error('处理文档失败:', processErr)

      await recordsCollection.doc(recordId).update({
        data: {
          status: 'failed',
          error: processErr.message || '文档分析失败',
          completedAt: db.serverDate()
        }
      })

      return {
        code: -1,
        message: processErr.message || '文档分析失败',
        data: {
          _id: recordId,
          status: 'failed'
        }
      }
    }
  } catch (err) {
    console.error('创建记录失败', err)
    return {
      code: -1,
      message: err.message || '创建记录失败'
    }
  }
}

async function processDocument(fileID, fileType) {
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('未配置 ANTHROPIC_AUTH_TOKEN 环境变量')
  }

  const fileRes = await cloud.downloadFile({
    fileID
  })

  const fileBuffer = fileRes.fileContent
  const textContent = await extractText(fileBuffer, fileType)

  if (!textContent.trim()) {
    throw new Error('文档内容为空，无法生成导图')
  }

  const response = await axios.post(
    'https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages',
    {
      model: 'mimo-v2.5',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `请分析以下文档内容，并将其转换为结构化的思维导图数据格式。

文档内容：
${textContent.substring(0, 8000)}

要求：
1. 识别文档的主要内容和层级关系
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

  const content = response.data.content[0].text
  return normalizeMindmapData(parseMindmapJson(content))
}

async function extractText(fileBuffer, fileType) {
  const normalizedType = fileType.toLowerCase()

  if (normalizedType === 'pdf') {
    const pdfData = await pdf(fileBuffer)
    return pdfData.text || ''
  }

  if (normalizedType === 'doc' || normalizedType === 'docx') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer })
    return result.value || ''
  }

  throw new Error('不支持的文件格式')
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
