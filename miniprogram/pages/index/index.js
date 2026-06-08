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

  // 轮询定时器
  pollTimer: null,

  onLoad() {
    this.getUserPoints()
    this.loadRecentRecords()
  },

  onShow() {
    this.loadRecentRecords()
  },

  onUnload() {
    // 清除定时器
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
    }
  },

  // 获取用户积分
  async getUserPoints() {
    try {
      const res = await api.getUserPoints()
      if (res && res.code === 0) {
        this.setData({
          points: res.points || 0
        })
      } else {
        this.setData({ points: 0 })
      }
    } catch (err) {
      console.error('获取积分失败', err)
      this.setData({ points: 0 })
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

  // 主按钮点击事件
  handleMainAction() {
    if (this.data.tempFilePath) {
      this.generateMindmap()
    } else {
      this.chooseImage()
    }
  },

  // 生成思维导图
  async generateMindmap() {
    if (!this.data.tempFilePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
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
            wx.switchTab({ url: '/pages/profile/profile' })
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

      // 2. 调用云函数（立即返回记录ID）
      const analyzeRes = await api.analyzeImage(uploadRes.fileID)

      if (analyzeRes.code !== 0) {
        throw new Error(analyzeRes.message || '分析失败')
      }

      const recordId = analyzeRes.data._id

      // 3. 扣除积分
      await api.deductPoints(10, '手写笔记转导图')

      this.setData({ loadingText: '正在生成导图，请耐心等待...' })

      // 4. 轮询查询处理状态
      this.pollResult(recordId)

    } catch (err) {
      console.error('生成失败', err)
      this.setData({ loading: false })
      wx.showToast({
        title: err.message || '生成失败，请重试',
        icon: 'none'
      })
    }
  },

  // 轮询查询处理结果
  pollResult(recordId) {
    let pollCount = 0
    const maxPoll = 120 // 最多轮询120次（约4分钟）

    this.pollTimer = setInterval(async () => {
      pollCount++

      if (pollCount > maxPoll) {
        clearInterval(this.pollTimer)
        this.setData({ loading: false })
        wx.showModal({
          title: '处理时间较长',
          content: '图片识别需要一些时间，是否继续等待？',
          confirmText: '继续等待',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              this.pollResult(recordId)
            }
          }
        })
        return
      }

      try {
        const db = wx.cloud.database()
        const res = await db.collection('records').doc(recordId).get()
        const record = res.data

        if (record.status === 'completed') {
          // 处理完成
          clearInterval(this.pollTimer)
          this.setData({ loading: false })
          this.getUserPoints() // 刷新积分
          this.loadRecentRecords() // 刷新记录

          wx.navigateTo({
            url: `/pages/result/result?mindmapId=${recordId}`
          })

        } else if (record.status === 'failed') {
          // 处理失败
          clearInterval(this.pollTimer)
          this.setData({ loading: false })
          wx.showToast({ title: '识别失败，请重试', icon: 'none' })

        } else {
          // 仍在处理中
          const texts = ['正在识别笔迹...', '正在整理内容...', '正在生成结构...', '识别较复杂的手写内容需要更多时间，请耐心等待...']
          const textIndex = Math.min(Math.floor(pollCount / 10), texts.length - 1)
          this.setData({ loadingText: texts[textIndex] })
        }
      } catch (err) {
        console.error('查询状态失败', err)
      }
    }, 2000) // 每2秒查询一次
  },

  // 查看记录
  viewRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/result/result?mindmapId=${id}`
    })
  }
})
