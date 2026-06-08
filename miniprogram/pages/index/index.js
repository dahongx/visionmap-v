const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    selectedType: 'mindmap',
    points: 0,
    pointsCost: 10,
    canGenerate: false,
    loading: false,
    loadingText: '正在分析...',
    tempFilePath: null,
    fileType: null
  },

  onLoad() {
    this.getUserPoints()
  },

  // 获取用户积分
  async getUserPoints() {
    try {
      const res = await api.getUserPoints()
      this.setData({
        points: res.points
      })
    } catch (err) {
      console.error('获取积分失败', err)
    }
  },

  // 选择图片
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({
          tempFilePath,
          fileType: 'image',
          canGenerate: true,
          pointsCost: 10
        })
      }
    })
  },

  // 选择文档
  chooseDocument() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].path
        const fileName = res.tempFiles[0].name
        const ext = fileName.split('.').pop().toLowerCase()

        this.setData({
          tempFilePath,
          fileType: ext,
          canGenerate: true,
          pointsCost: 15
        })
      }
    })
  },

  // 选择导图类型
  selectType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      selectedType: type
    })
  },

  // 生成思维导图
  async generateMindmap() {
    if (!this.data.tempFilePath) {
      wx.showToast({
        title: '请先上传文件',
        icon: 'none'
      })
      return
    }

    if (this.data.points < this.data.pointsCost) {
      wx.showModal({
        title: '积分不足',
        content: '当前积分不足，是否邀请好友获取积分？',
        confirmText: '去邀请',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // TODO: 跳转到邀请页面
          }
        }
      })
      return
    }

    this.setData({
      loading: true,
      loadingText: '正在上传文件...'
    })

    try {
      // 1. 上传文件到云存储
      const cloudPath = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `uploads/${cloudPath}`,
        filePath: this.data.tempFilePath
      })

      this.setData({ loadingText: '正在分析内容...' })

      // 2. 调用云函数分析
      let analyzeRes
      if (this.data.fileType === 'image') {
        analyzeRes = await api.analyzeImage(uploadRes.fileID)
      } else {
        analyzeRes = await api.analyzeDocument(uploadRes.fileID, this.data.fileType)
      }

      this.setData({ loadingText: '正在生成思维导图...' })

      // 3. 生成思维导图
      const mindmapRes = await api.generateMindmap(
        analyzeRes.data,
        this.data.selectedType
      )

      // 4. 扣除积分
      await api.deductPoints(this.data.pointsCost, `${this.data.fileType}转导图`)

      this.setData({ loading: false })

      // 5. 跳转到结果页
      wx.navigateTo({
        url: `/pages/result/result?mindmapId=${mindmapRes.data._id}`
      })

    } catch (err) {
      console.error('生成失败', err)
      this.setData({ loading: false })
      wx.showToast({
        title: '生成失败，请重试',
        icon: 'none'
      })
    }
  }
})
