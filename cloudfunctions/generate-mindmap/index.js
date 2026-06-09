const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { mindmapData, mapType } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 这里我们生成思维导图的JSON数据
    // 实际的图片生成在前端完成（使用Canvas）

    // 1. 优化数据结构
    const optimizedData = optimizeMindmapData(mindmapData, mapType)

    // 2. 保存到数据库
    const db = cloud.database()
    const _ = db.command
    const recordsCollection = db.collection('records')

    // 查找最新记录并更新
    const recordRes = await recordsCollection
      .where({ userId: openid })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()

    if (recordRes.data.length > 0) {
      const recordId = recordRes.data[0]._id
      await recordsCollection.doc(recordId).update({
        data: {
          resultJson: _.set(optimizedData),
          mapType: mapType
        }
      })

      return {
        code: 0,
        data: {
          _id: recordId,
          ...optimizedData
        }
      }
    }

    return {
      code: -1,
      message: '未找到记录'
    }

  } catch (err) {
    console.error('生成思维导图失败', err)
    return {
      code: -1,
      message: err.message || '生成失败'
    }
  }
}

// 优化思维导图数据
function optimizeMindmapData(data, mapType) {
  // 确保数据结构正确
  const ensureStructure = (node) => {
    if (!node.text) node.text = '未命名'
    if (!node.children) node.children = []
    node.children.forEach(ensureStructure)
    return node
  }

  return ensureStructure(data)
}
