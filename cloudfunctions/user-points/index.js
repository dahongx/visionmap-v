const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const usersCollection = db.collection('users')
const pointLogsCollection = db.collection('point_logs')

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, points, reason, userInfo } = event

  try {
    switch (action) {
      case 'get':
        return await getUserPoints(openid)

      case 'deduct':
        return await deductPoints(openid, points, reason)

      case 'add':
        return await addPoints(openid, points, reason)

      case 'signIn':
        return await signIn(openid)

      case 'updateUserInfo':
        return await updateUserInfo(openid, userInfo)

      default:
        return { code: -1, message: '未知操作' }
    }
  } catch (err) {
    console.error('操作失败', err)
    return { code: -1, message: err.message }
  }
}

// 获取用户积分
async function getUserPoints(openid) {
  try {
    const res = await usersCollection.doc(openid).get()
    if (res.data) {
      // 测试模式：返回无限积分
      return { code: 0, points: 9999 }
    }
  } catch (err) {
    // 用户不存在，创建新用户
    try {
      await usersCollection.add({
        data: {
          _id: openid,
          points: 9999,
          createdAt: db.serverDate(),
          lastSignIn: null
        }
      })
      return { code: 0, points: 9999 }
    } catch (createErr) {
      console.error('创建用户失败', createErr)
      return { code: 0, points: 9999 }
    }
  }

  return { code: 0, points: 9999 }
}

// 扣除积分
async function deductPoints(openid, points, reason) {
  const userRes = await usersCollection.doc(openid).get()
  const user = userRes.data

  if (user.points < points) {
    return { code: -1, message: '积分不足' }
  }

  await usersCollection.doc(openid).update({
    data: {
      points: db.command.inc(-points)
    }
  })

  // 记录积分日志
  await pointLogsCollection.add({
    data: {
      userId: openid,
      change: -points,
      reason,
      createdAt: db.serverDate()
    }
  })

  return { code: 0, points: user.points - points }
}

// 增加积分
async function addPoints(openid, points, reason) {
  await usersCollection.doc(openid).update({
    data: {
      points: db.command.inc(points)
    }
  })

  // 记录积分日志
  await pointLogsCollection.add({
    data: {
      userId: openid,
      change: points,
      reason,
      createdAt: db.serverDate()
    }
  })

  const userRes = await usersCollection.doc(openid).get()
  return { code: 0, points: userRes.data.points }
}

// 每日签到
async function signIn(openid) {
  const userRes = await usersCollection.doc(openid).get()
  const user = userRes.data

  const today = new Date().toISOString().split('T')[0]

  if (user.lastSignIn === today) {
    return { code: -1, message: '今日已签到' }
  }

  await usersCollection.doc(openid).update({
    data: {
      points: db.command.inc(5),
      lastSignIn: today
    }
  })

  // 记录积分日志
  await pointLogsCollection.add({
    data: {
      userId: openid,
      change: 5,
      reason: '每日签到',
      createdAt: db.serverDate()
    }
  })

  return { code: 0, points: user.points + 5 }
}

// 更新用户信息
async function updateUserInfo(openid, userInfo) {
  await usersCollection.doc(openid).update({
    data: {
      nickName: userInfo.nickName,
      avatarUrl: userInfo.avatarUrl
    }
  })

  return { code: 0 }
}
