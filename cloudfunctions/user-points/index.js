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
    return { code: -1, message: err.message || '操作失败' }
  }
}

async function ensureUser(openid) {
  try {
    const res = await usersCollection.doc(openid).get()
    if (res.data) {
      return res.data
    }
  } catch (err) {
    if (err.errCode !== -1 && err.errCode !== -502005) {
      console.warn('读取用户失败，尝试创建用户:', err.message)
    }
  }

  const user = {
    _id: openid,
    points: 9999,
    createdAt: db.serverDate(),
    lastSignIn: null
  }

  try {
    await usersCollection.add({
      data: user
    })
  } catch (err) {
    console.warn('创建用户可能已存在:', err.message)
  }

  return user
}

// 获取用户积分
async function getUserPoints(openid) {
  await ensureUser(openid)
  return { code: 0, points: 9999 }
}

// 扣除积分
async function deductPoints(openid, points, reason) {
  const user = await ensureUser(openid)

  if (user.points < points) {
    return { code: -1, message: '积分不足' }
  }

  await usersCollection.doc(openid).update({
    data: {
      points: db.command.inc(-points)
    }
  })

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
  const user = await ensureUser(openid)

  await usersCollection.doc(openid).update({
    data: {
      points: db.command.inc(points)
    }
  })

  await pointLogsCollection.add({
    data: {
      userId: openid,
      change: points,
      reason,
      createdAt: db.serverDate()
    }
  })

  return { code: 0, points: user.points + points }
}

// 每日签到
async function signIn(openid) {
  const user = await ensureUser(openid)
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

  await pointLogsCollection.add({
    data: {
      userId: openid,
      change: 5,
      reason: '每日签到',
      createdAt: db.serverDate()
    }
  })

  return { code: 0, points: user.points + 5, added: 5 }
}

// 更新用户信息
async function updateUserInfo(openid, userInfo = {}) {
  await ensureUser(openid)

  await usersCollection.doc(openid).update({
    data: {
      nickName: userInfo.nickName || '',
      avatarUrl: userInfo.avatarUrl || ''
    }
  })

  return { code: 0 }
}
