const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    points: 0,
    tempFilePath: null,
    canGenerate: false,
    loading: false,
    loadingText: '正在分析...',
    recentRecords: []
  },

  onLoad() {
    this.getUserPoints()
    this.loadRecentRecords()
  },

  onShow() {
    this.loadRecentRecords()
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

  // 加载最近记录
  async loadRecentRecords() {
    try {
      const res = await api.getRecords(1, 5)
      this.setData({
        recentRecords: res.data || []
      })
    } catch (err) {
      console.error('加载记录失败', err)
    }
  },

  // 选择图片（拍照）
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({
          tempFilePath,
          canGenerate: true
        })
      }
    })
  },

  // 从相册选择
  chooseFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({
          tempFilePath,
          canGenerate: true
        })
      }
    })
  },

  // 清除已选择图片
  clearImage() {
    this.setData({
      tempFilePath: null,
      canGenerate: false
    })
  },

  // 生成思维导图
  async generateMindmap() {
    if (!this.data.tempFilePath) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      })
      return
    }

    if (this.data.points < 10) {
      wx.showModal({
        title: '积分不足',
        content: '当前积分不足，是否邀请好友获取积分？',
        confirmText: '去邀请',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/profile/profile'
            })
          }
        }
      })
      return
    }

    this.setData({
      loading: true,
      loadingText: '正在上传图片...'
    })

    try {
      // 1. 上传图片到云存储
      const cloudPath = `uploads/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: this.data.tempFilePath
      })

      this.setData({ loadingText: '正在识别笔迹...' })

      // 2. 调用云函数分析图片
      const analyzeRes = await api.analyzeImage(uploadRes.fileID)

      if (analyzeRes.code !== 0) {
        throw new Error(analyzeRes.message || '分析失败')
      }

      this.setData({ loadingText: '正在生成导图...' })

      // 3. 生成思维导图
      const mindmapRes = await api.generateMindmap(analyzeRes.data, 'mindmap')

      if (mindmapRes.code !== 0) {
        throw new Error(mindmapRes.message || '生成失败')
      }

      // 4. 扣除积分
      await api.deductPoints(10, '手写笔记转导图')

      this.setData({ loading: false })

      // 5. 跳转到结果页
      wx.navigateTo({
        url: `/pages/result/result?mindmapId=${mindmapRes.data._id}`
      })

    } catch (err) {
      console.error('生成失败', err)
      this.setData({ loading: false })
      wx.showToast({
        title: err.message || '生成失败，请重试',
        icon: 'none'
      })
    }
  },

  // 查看记录
  viewRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/result/result?mindmapId=${id}`
    })
  }
})
