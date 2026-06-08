const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { fileID } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 1. 先创建记录，状态为"处理中"
    const db = cloud.database()
    const recordsCollection = db.collection('records')

    const record = {
      userId: openid,
      type: 'image',
      sourceUrl: fileID,
      resultJson: null,
      status: 'processing',
      pointsCost: 10,
      createdAt: db.serverDate()
    }

    const addRes = await recordsCollection.add({
      data: record
    })

    const recordId = addRes._id

    // 2. 立即返回记录ID
    // 后台继续处理AI请求
    processImageAsync(fileID, openid, recordId)

    return {
      code: 0,
      data: {
        _id: recordId,
        status: 'processing'
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

// 异步处理图片分析（不受云函数超时限制）
async function processImageAsync(fileID, openid, recordId) {
  try {
    // 1. 下载图片
    const fileRes = await cloud.downloadFile({
      fileID
    })

    const imageBuffer = fileRes.fileContent
    const base64Image = imageBuffer.toString('base64')

    // 2. 调用Claude API分析图片（完整提示词，不删减）
    const apiKey = process.env.CLAUDE_API_KEY
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

    // 3. 解析返回结果
    const content = response.data.content[0].text

    let mindmapData
    try {
      mindmapData = JSON.parse(content)
    } catch (e) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        mindmapData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('无法解析AI返回的数据')
      }
    }

    // 4. 更新记录状态为"已完成"
    const db = cloud.database()
    await db.collection('records').doc(recordId).update({
      data: {
        resultJson: mindmapData,
        status: 'completed'
      }
    })

    console.log('图片分析完成，记录ID:', recordId)

  } catch (err) {
    console.error('异步处理图片失败:', err)

    // 更新记录状态为"失败"
    const db = cloud.database()
    await db.collection('records').doc(recordId).update({
      data: {
        status: 'failed',
        error: err.message
      }
    })
  }
}
