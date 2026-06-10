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

const initUser = async () => {
  return callCloudFunction('user-points', { action: 'init' })
}

const getUserProfile = async () => {
  return callCloudFunction('user-points', { action: 'getProfile' })
}

const getUserPoints = async () => {
  return callCloudFunction('user-points', { action: 'get' })
}

const deductPoints = async (points, reason) => {
  return callCloudFunction('user-points', { action: 'deduct', points, reason })
}

const addPoints = async (points, reason) => {
  return callCloudFunction('user-points', { action: 'add', points, reason })
}

const signIn = async () => {
  return callCloudFunction('user-points', { action: 'signIn' })
}

const updateUserInfo = async (userInfo) => {
  return callCloudFunction('user-points', { action: 'updateUserInfo', userInfo })
}

const updateUserProfile = async (profile) => {
  return callCloudFunction('user-points', { action: 'updateProfile', profile })
}

const getPointLogs = async (limit = 20) => {
  return callCloudFunction('user-points', { action: 'pointLogs', limit })
}

const analyzeImage = async (fileID) => {
  return callCloudFunction('analyze-image', { fileID })
}

const analyzeDocument = async (fileID, fileType) => {
  return callCloudFunction('analyze-document', { fileID, fileType })
}

const generateMindmap = async (data, mapType) => {
  return callCloudFunction('generate-mindmap', { mindmapData: data, mapType })
}

const getMindmap = async (mindmapId) => {
  const result = await callCloudFunction('get-record', { action: 'detail', recordId: mindmapId })

  if (result && result.code === 0) {
    return result.data
  }

  throw new Error((result && result.message) || '获取导图失败')
}

const getRecords = async (page = 1, pageSize = 10, filter = 'all') => {
  return callCloudFunction('get-record', { action: 'list', page, pageSize, filter })
}

const getRecord = async (recordId) => {
  return callCloudFunction('get-record', { action: 'detail', recordId })
}

const updateMindmap = async (recordId, mindmapData) => {
  return callCloudFunction('get-record', { action: 'update', recordId, mindmapData })
}

const markMindmapExported = async (recordId) => {
  return callCloudFunction('get-record', { action: 'markExported', recordId })
}

const deleteRecord = async (recordId) => {
  return callCloudFunction('get-record', { action: 'delete', recordId })
}

module.exports = {
  initUser,
  getUserProfile,
  getUserPoints,
  deductPoints,
  addPoints,
  signIn,
  updateUserInfo,
  updateUserProfile,
  getPointLogs,
  analyzeImage,
  analyzeDocument,
  generateMindmap,
  getMindmap,
  getRecords,
  getRecord,
  updateMindmap,
  markMindmapExported,
  deleteRecord
}
