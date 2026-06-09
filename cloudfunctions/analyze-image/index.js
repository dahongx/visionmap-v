const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { fileID } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log('=== analyze-image 开始 ===')
  console.log('fileID:', fileID)
  console.log('openid:', openid)

  if (!fileID) {
    return {
      code: -1,
      message: '缺少图片文件ID'
    }
  }

  try {
    const db = cloud.database()
    const recordsCollection = db.collection('records')

    const addRes = await recordsCollection.add({
      data: {
        userId: openid,
        type: 'image',
        sourceUrl: fileID,
        title: '图片识别中',
        resultJson: null,
        status: 'processing',
        pointsCost: 10,
        createdAt: db.serverDate()
      }
    })

    const recordId = addRes._id
    console.log('记录创建成功，recordId:', recordId)

    try {
      const mindmapData = await processImage(fileID)

      // 先删除resultJson字段，再添加新的值
      await recordsCollection.doc(recordId).update({
        data: {
          title: mindmapData.text || '未命名导图',
          status: 'completed',
          completedAt: db.serverDate()
        }
      })

      // 重新设置resultJson字段
      await recordsCollection.doc(recordId).update({
        data: {
          resultJson: mindmapData
        }
      })

      console.log('图片分析完成，记录ID:', recordId)
      return {
        code: 0,
        data: {
          _id: recordId,
          status: 'completed',
          resultJson: mindmapData
        }
      }
    } catch (processErr) {
      console.error('处理图片失败:', processErr)

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
        data: {
          _id: recordId,
          status: 'failed'
        }
      }
    }
  } catch (err) {
    console.error('创建记录失败:', err)
    return {
      code: -1,
      message: err.message || '创建记录失败'
    }
  }
}

async function processImage(fileID) {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    throw new Error('未配置 CLAUDE_API_KEY 环境变量')
  }

  console.log('正在下载图片...')
  const fileRes = await cloud.downloadFile({
    fileID
  })

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
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Image
            }
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
      timeout: 120000
    }
  )

  const apiTime = Date.now() - startTime
  console.log('AI API调用完成，耗时:', apiTime, 'ms')

  const content = response.data.content[0].text
  console.log('AI返回内容长度:', content.length)

  return normalizeMindmapData(parseMindmapJson(content))
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
