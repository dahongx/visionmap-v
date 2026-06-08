const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { recordId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const db = cloud.database()
    const res = await db.collection('records').doc(recordId).get()

    const record = res.data

    // 验证记录是否属于当前用户
    if (record.userId !== openid) {
      return { code: -1, message: '无权访问此记录' }
    }

    return {
      code: 0,
      data: record
    }

  } catch (err) {
    console.error('查询记录失败', err)
    return {
      code: -1,
      message: err.message || '查询失败'
    }
  }
}
