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
    // 1. 下载图片
    const fileRes = await cloud.downloadFile({
      fileID
    })

    const imageBuffer = fileRes.fileContent
    const base64Image = imageBuffer.toString('base64')

    // 2. 调用Claude API分析图片
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
        }
      }
    )

    // 3. 解析返回结果
    const content = response.data.content[0].text

    // 尝试提取JSON
    let mindmapData
    try {
      // 尝试直接解析
      mindmapData = JSON.parse(content)
    } catch (e) {
      // 如果直接解析失败，尝试提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        mindmapData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('无法解析AI返回的数据')
      }
    }

    // 4. 保存到数据库
    const db = cloud.database()
    const recordsCollection = db.collection('records')

    const record = {
      userId: openid,
      type: 'image',
      sourceUrl: fileID,
      resultJson: mindmapData,
      pointsCost: 10,
      createdAt: db.serverDate()
    }

    const addRes = await recordsCollection.add({
      data: record
    })

    return {
      code: 0,
      data: {
        _id: addRes._id,
        ...mindmapData
      }
    }

  } catch (err) {
    console.error('图片分析失败', err)
    return {
      code: -1,
      message: err.message || '分析失败'
    }
  }
}
