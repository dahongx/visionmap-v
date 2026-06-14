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
  recordsLoading: false,

  onLoad() {
    this.getUserPoints()
    this.loadRecentRecords()
  },

  onShow() {
    if (this.data.recentRecords.length > 0) return
    this.loadRecentRecords()
  },

  onUnload() {
    this.clearPollTimer()
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
    if (this.recordsLoading) return
    this.recordsLoading = true

    try {
      const res = await api.getRecords(1, 5)
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '加载记录失败')
      }

      this.setData({
        recentRecords: res.data || []
      })
    } catch (err) {
      console.error('加载记录失败', err)
    } finally {
      this.recordsLoading = false
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

    // 生成前检查积分：低于10分拦截，提示充值
    if (this.data.points < 10) {
      wx.showModal({
        title: '积分不足',
        content: '当前积分不足 10，无法生成。请先充值积分。',
        confirmText: '去充值',
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

      // 2. 调用云函数（同步返回，已扣费）
      const analyzeRes = await api.analyzeImage(uploadRes.fileID)

      // 积分不足（云端二次校验）
      if (analyzeRes.code === 1001) {
        this.setData({ loading: false })
        wx.showModal({
          title: '积分不足',
          content: analyzeRes.message || '积分不足，请先充值',
          confirmText: '去充值',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({ url: '/pages/profile/profile' })
            }
          }
        })
        return
      }

      if (analyzeRes.code !== 0) {
        throw new Error(analyzeRes.message || '分析失败')
      }

      const recordId = analyzeRes.data._id
      const pointsCharged = analyzeRes.data.pointsCharged || 0

      this.setData({ loadingText: '正在生成导图，请耐心等待...' })

      if (analyzeRes.data.status === 'completed') {
        this.finishGenerate(recordId, pointsCharged)
        return
      }

      // 4. 轮询查询处理状态（兼容云端返回 processing 的情况）
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

  // 生成完成
  finishGenerate(recordId, pointsCharged) {
    this.clearPollTimer()
    this.setData({ loading: false })
    this.getUserPoints()
    this.loadRecentRecords()

    // 弹窗告知本次消耗的积分，用户确认后查看结果
    const goResult = () => {
      wx.navigateTo({
        url: `/pages/result/result?mindmapId=${recordId}`
      })
    }

    if (pointsCharged && pointsCharged > 0) {
      wx.showModal({
        title: '生成完成',
        content: `本次消耗 ${pointsCharged} 积分，可继续查看和编辑。`,
        showCancel: false,
        confirmText: '查看导图',
        success: goResult
      })
    } else {
      goResult()
    }
  },

  // 清除轮询定时器
  clearPollTimer() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  },

  // 轮询查询处理结果
  pollResult(recordId) {
    let pollCount = 0
    const maxPollCount = 120

    this.clearPollTimer()

    this.pollTimer = setInterval(async () => {
      pollCount++

      try {
        if (pollCount > maxPollCount) {
          this.clearPollTimer()
          this.setData({ loading: false })
          wx.showToast({ title: '生成超时，请稍后在历史记录查看', icon: 'none' })
          return
        }

        // 使用云函数查询记录状态
        const res = await api.getRecord(recordId)

        if (res.code !== 0) {
          console.error('查询失败:', res.message)
          return
        }

        const record = res.data

        if (record.status === 'completed') {
          // 处理完成
          this.finishGenerate(recordId, record.pointsCost || 0)

        } else if (record.status === 'failed') {
          // 处理失败
          this.clearPollTimer()
          this.setData({ loading: false })
          wx.showToast({ title: record.error || '识别失败，请重试', icon: 'none' })

        } else {
          // 仍在处理中，继续等待
          const texts = ['正在识别笔迹...', '正在整理内容...', '正在生成结构...', '手写内容识别中，请耐心等待...']
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
