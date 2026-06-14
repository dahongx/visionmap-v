const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 创建集合
    const collections = ['users', 'records', 'point_logs', 'usage_logs']

    for (const collectionName of collections) {
      try {
        await db.createCollection(collectionName)
        console.log(`集合 ${collectionName} 创建成功`)
      } catch (err) {
        if (isCollectionExistsError(err)) {
          console.log(`集合 ${collectionName} 已存在`)
        } else {
          throw err
        }
      }
    }

    return {
      code: 0,
      message: '数据库初始化完成'
    }

  } catch (err) {
    console.error('数据库初始化失败', err)
    return {
      code: -1,
      message: err.message
    }
  }
}

function isCollectionExistsError(err) {
  const message = err.errMsg || err.message || ''
  return (
    err.errCode === -502005 ||
    err.errCode === -501001 ||
    message.includes('ResourceExist') ||
    message.includes('Table exist') ||
    message.includes('DATABASE_COLLECTION_ALREADY_EXIST')
  )
}
