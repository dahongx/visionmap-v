const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const usersCollection = db.collection('users')
const pointLogsCollection = db.collection('point_logs')

const INITIAL_POINTS = 50
const SIGN_IN_POINTS = 5
const MAX_NICKNAME_LENGTH = 24

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action = 'init' } = event

  if (!openid) {
    return { code: -1, message: '无法获取微信用户身份，请重新进入小程序' }
  }

  try {
    switch (action) {
      case 'init':
      case 'getProfile':
        return await getProfile(openid)

      case 'get':
        return await getUserPoints(openid)

      case 'deduct':
        return await deductPoints(openid, event.points, event.reason)

      case 'add':
        return await addPoints(openid, event.points, event.reason)

      case 'signIn':
        return await signIn(openid)

      case 'updateProfile':
      case 'updateUserInfo':
        return await updateProfile(openid, event.profile || event.userInfo || {})

      case 'pointLogs':
        return await getPointLogs(openid, event.limit)

      default:
        return { code: -1, message: '未知操作' }
    }
  } catch (err) {
    console.error('user-points failed', err)
    return { code: -1, message: err.message || '操作失败' }
  }
}

async function ensureUser(openid) {
  try {
    const res = await usersCollection.doc(openid).get()
    if (res.data) {
      const user = res.data
      if (typeof user.points !== 'number') {
        await usersCollection.doc(openid).update({
          data: {
            points: INITIAL_POINTS,
            updatedAt: db.serverDate()
          }
        })
        user.points = INITIAL_POINTS
      }
      return user
    }
  } catch (err) {
    if (!isNotFoundError(err)) {
      console.warn('read user failed, will try create user', err)
    }
  }

  const user = {
    _id: openid,
    points: INITIAL_POINTS,
    nickName: '',
    avatarUrl: '',
    lastSignIn: '',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }

  try {
    await usersCollection.doc(openid).set({ data: user })
    await addPointLog(openid, INITIAL_POINTS, '新用户注册赠送')
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      const res = await usersCollection.doc(openid).get()
      return res.data || user
    }
    throw err
  }

  return user
}

async function getProfile(openid) {
  const user = await ensureUser(openid)
  return {
    code: 0,
    user: formatUser(openid, user),
    points: Number(user.points) || 0
  }
}

async function getUserPoints(openid) {
  const user = await ensureUser(openid)
  return {
    code: 0,
    points: Number(user.points) || 0,
    user: formatUser(openid, user)
  }
}

async function deductPoints(openid, points, reason) {
  const value = normalizePoints(points)
  const user = await ensureUser(openid)
  const currentPoints = Number(user.points) || 0

  if (currentPoints < value) {
    return { code: -1, message: '积分不足', points: currentPoints }
  }

  await usersCollection.doc(openid).update({
    data: {
      points: _.inc(-value),
      updatedAt: db.serverDate()
    }
  })

  await addPointLog(openid, -value, reason || '积分消耗')

  return {
    code: 0,
    points: currentPoints - value
  }
}

async function addPoints(openid, points, reason) {
  const value = normalizePoints(points)
  const user = await ensureUser(openid)
  const currentPoints = Number(user.points) || 0

  await usersCollection.doc(openid).update({
    data: {
      points: _.inc(value),
      updatedAt: db.serverDate()
    }
  })

  await addPointLog(openid, value, reason || '积分增加')

  return {
    code: 0,
    points: currentPoints + value
  }
}

async function signIn(openid) {
  const user = await ensureUser(openid)
  const today = getChinaDateKey()

  if (user.lastSignIn === today) {
    return {
      code: -1,
      message: '今日已签到',
      points: Number(user.points) || 0
    }
  }

  await usersCollection.doc(openid).update({
    data: {
      points: _.inc(SIGN_IN_POINTS),
      lastSignIn: today,
      updatedAt: db.serverDate()
    }
  })

  await addPointLog(openid, SIGN_IN_POINTS, '每日签到')

  return {
    code: 0,
    points: (Number(user.points) || 0) + SIGN_IN_POINTS,
    added: SIGN_IN_POINTS,
    signed: true
  }
}

async function updateProfile(openid, profile = {}) {
  await ensureUser(openid)

  const nickName = sanitizeNickname(profile.nickName)
  const avatarUrl = sanitizeAvatarUrl(profile.avatarUrl)

  await usersCollection.doc(openid).update({
    data: {
      nickName,
      avatarUrl,
      updatedAt: db.serverDate()
    }
  })

  const res = await usersCollection.doc(openid).get()
  return {
    code: 0,
    user: formatUser(openid, res.data),
    points: Number(res.data.points) || 0
  }
}

async function getPointLogs(openid, limit) {
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 50)
  const res = await pointLogsCollection
    .where({ userId: openid })
    .orderBy('createdAt', 'desc')
    .limit(pageSize)
    .get()

  return {
    code: 0,
    data: res.data.map((item) => ({
      _id: item._id,
      change: item.change,
      reason: item.reason || '',
      createdAt: item.createdAt
    }))
  }
}

async function addPointLog(openid, change, reason) {
  await pointLogsCollection.add({
    data: {
      userId: openid,
      change,
      reason,
      createdAt: db.serverDate()
    }
  })
}

function formatUser(openid, user) {
  const points = Number(user.points) || 0
  return {
    userId: maskOpenid(openid),
    nickName: user.nickName || '',
    avatarUrl: user.avatarUrl || '',
    points,
    lastSignIn: user.lastSignIn || '',
    hasProfile: !!(user.nickName || user.avatarUrl)
  }
}

function sanitizeNickname(value) {
  const nickName = String(value || '').trim()
  if (!nickName) return ''
  return nickName.slice(0, MAX_NICKNAME_LENGTH)
}

function sanitizeAvatarUrl(value) {
  const avatarUrl = String(value || '').trim()
  if (!avatarUrl) return ''
  if (avatarUrl.startsWith('cloud://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('http://')) {
    return avatarUrl
  }
  return ''
}

function normalizePoints(points) {
  const value = Math.floor(Number(points))
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('积分数量不正确')
  }
  return value
}

function getChinaDateKey() {
  const now = new Date()
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return chinaTime.toISOString().slice(0, 10)
}

function maskOpenid(openid) {
  if (!openid || openid.length <= 8) return openid || ''
  return `${openid.slice(0, 4)}****${openid.slice(-4)}`
}

function isNotFoundError(err) {
  const message = err.errMsg || err.message || ''
  return err.errCode === -502005 || message.includes('not exist') || message.includes('does not exist')
}

function isAlreadyExistsError(err) {
  const message = err.errMsg || err.message || ''
  return message.includes('already exists') || message.includes('duplicate') || message.includes('ResourceExist')
}
