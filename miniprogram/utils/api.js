/**
 * API 封装层
 * 统一封装云函数调用
 */

// 获取用户积分
const getUserPoints = async () => {
  const res = await wx.cloud.callFunction({
    name: 'user-points',
    data: { action: 'get' }
  })
  return res.result
}

// 扣除积分
const deductPoints = async (points, reason) => {
  const res = await wx.cloud.callFunction({
    name: 'user-points',
    data: { action: 'deduct', points, reason }
  })
  return res.result
}

// 增加积分
const addPoints = async (points, reason) => {
  const res = await wx.cloud.callFunction({
    name: 'user-points',
    data: { action: 'add', points, reason }
  })
  return res.result
}

// 每日签到
const signIn = async () => {
  const res = await wx.cloud.callFunction({
    name: 'user-points',
    data: { action: 'signIn' }
  })
  return res.result
}

// 分析图片
const analyzeImage = async (fileID) => {
  const res = await wx.cloud.callFunction({
    name: 'analyze-image',
    data: { fileID }
  })
  return res.result
}

// 分析文档
const analyzeDocument = async (fileID, fileType) => {
  const res = await wx.cloud.callFunction({
    name: 'analyze-document',
    data: { fileID, fileType }
  })
  return res.result
}

// 生成思维导图
const generateMindmap = async (data, mapType) => {
  const res = await wx.cloud.callFunction({
    name: 'generate-mindmap',
    data: { mindmapData: data, mapType }
  })
  return res.result
}

// 获取思维导图
const getMindmap = async (mindmapId) => {
  const db = wx.cloud.database()
  const res = await db.collection('records').doc(mindmapId).get()
  return res.data
}

// 获取记录列表
const getRecords = async (page = 1, pageSize = 10) => {
  const db = wx.cloud.database()
  const res = await db.collection('records')
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  return { data: res.data }
}

// 更新用户信息
const updateUserInfo = async (userInfo) => {
  const res = await wx.cloud.callFunction({
    name: 'user-points',
    data: { action: 'updateUserInfo', userInfo }
  })
  return res.result
}

// 查询记录状态
const getRecord = async (recordId) => {
  const res = await wx.cloud.callFunction({
    name: 'get-record',
    data: { recordId }
  })
  return res.result
}

module.exports = {
  getUserPoints,
  deductPoints,
  addPoints,
  signIn,
  analyzeImage,
  analyzeDocument,
  generateMindmap,
  getMindmap,
  getRecords,
  updateUserInfo,
  getRecord
}
