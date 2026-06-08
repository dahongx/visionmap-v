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

  try {
    // 1. 下载文件
    const fileRes = await cloud.downloadFile({
      fileID
    })

    const fileBuffer = fileRes.fileContent
    let textContent = ''

    // 2. 解析文档内容
    if (fileType === 'pdf') {
      const pdfData = await pdf(fileBuffer)
      textContent = pdfData.text
    } else if (fileType === 'doc' || fileType === 'docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer })
      textContent = result.value
    } else {
      throw new Error('不支持的文件格式')
    }

    // 3. 调用Claude API分析内容
    const apiKey = process.env.CLAUDE_API_KEY
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
        }
      }
    )

    // 4. 解析返回结果
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

    // 5. 保存到数据库
    const db = cloud.database()
    const recordsCollection = db.collection('records')

    const record = {
      userId: openid,
      type: fileType,
      sourceUrl: fileID,
      resultJson: mindmapData,
      pointsCost: 15,
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
    console.error('文档分析失败', err)
    return {
      code: -1,
      message: err.message || '分析失败'
    }
  }
}
