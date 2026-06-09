/**
 * API 封装层
 * 统一封装云函数调用
 */

const callCloudFunction = async (name, data = {}) => {
  console.log(`[cloud] call ${name}`, data)
  try {
    const res = await wx.cloud.callFunction({
      name,
      data
    })
    console.log(`[cloud] success ${name}`, res.result)
    return res.result
  } catch (err) {
    console.error(`[cloud] fail ${name}`, err)
    throw err
  }
}

// 获取用户积分
const getUserPoints = async () => {
  return callCloudFunction('user-points', { action: 'get' })
}

// 扣除积分
const deductPoints = async (points, reason) => {
  return callCloudFunction('user-points', { action: 'deduct', points, reason })
}

// 增加积分
const addPoints = async (points, reason) => {
  return callCloudFunction('user-points', { action: 'add', points, reason })
}

// 每日签到
const signIn = async () => {
  return callCloudFunction('user-points', { action: 'signIn' })
}

// 分析图片
const analyzeImage = async (fileID) => {
  return callCloudFunction('analyze-image', { fileID })
}

// 分析文档
const analyzeDocument = async (fileID, fileType) => {
  return callCloudFunction('analyze-document', { fileID, fileType })
}

// 生成思维导图
const generateMindmap = async (data, mapType) => {
  return callCloudFunction('generate-mindmap', { mindmapData: data, mapType })
}

// 获取思维导图
const getMindmap = async (mindmapId) => {
  const result = await callCloudFunction('get-record', { action: 'detail', recordId: mindmapId })

  if (result && result.code === 0) {
    return result.data
  }

  throw new Error((result && result.message) || '获取导图失败')
}

// 获取记录列表
const getRecords = async (page = 1, pageSize = 10, filter = 'all') => {
  return callCloudFunction('get-record', { action: 'list', page, pageSize, filter })
}

// 更新用户信息
const updateUserInfo = async (userInfo) => {
  return callCloudFunction('user-points', { action: 'updateUserInfo', userInfo })
}

// 查询记录状态
const getRecord = async (recordId) => {
  return callCloudFunction('get-record', { action: 'detail', recordId })
}

// 保存思维导图
const updateMindmap = async (recordId, mindmapData) => {
  return callCloudFunction('get-record', { action: 'update', recordId, mindmapData })
}

// 标记已导出
const markMindmapExported = async (recordId) => {
  return callCloudFunction('get-record', { action: 'markExported', recordId })
}

// 删除记录
const deleteRecord = async (recordId) => {
  return callCloudFunction('get-record', { action: 'delete', recordId })
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
  getRecord,
  updateMindmap,
  markMindmapExported,
  deleteRecord
}
