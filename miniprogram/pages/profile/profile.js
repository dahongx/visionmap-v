const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    userInfo: {},
    points: 0
  },

  onLoad() {
    this.loadUserInfo()
    this.loadPoints()
  },

  onShow() {
    this.loadPoints()
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = app.globalData.userInfo
    if (userInfo) {
      this.setData({ userInfo })
    }
  },

  // 加载积分
  async loadPoints() {
    try {
      const res = await api.getUserPoints()
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '获取积分失败')
      }

      this.setData({
        points: res.points
      })
    } catch (err) {
      console.error('获取积分失败', err)
    }
  },

  // 登录
  async login() {
    try {
      const res = await wx.getUserProfile({
        desc: '用于展示用户信息'
      })

      app.globalData.userInfo = res.userInfo
      this.setData({
        userInfo: res.userInfo
      })

      // 同步用户信息到后端
      const updateRes = await api.updateUserInfo(res.userInfo)
      if (!updateRes || updateRes.code !== 0) {
        throw new Error((updateRes && updateRes.message) || '同步用户信息失败')
      }

    } catch (err) {
      console.error('登录失败', err)
      wx.showToast({
        title: err.message || '登录失败',
        icon: 'none'
      })
    }
  },

  // 邀请好友
  inviteFriend() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
  },

  // 每日签到
  async signIn() {
    try {
      const res = await api.signIn()
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '签到失败')
      }

      wx.showToast({
        title: `签到成功 +${res.added || 5}积分`,
        icon: 'success'
      })
      this.loadPoints()
    } catch (err) {
      console.error('签到失败', err)
      wx.showToast({
        title: err.message || '签到失败',
        icon: 'none'
      })
    }
  },

  // 查看历史
  showHistory() {
    wx.switchTab({
      url: '/pages/history/history'
    })
  },

  // 帮助说明
  showHelp() {
    wx.showModal({
      title: '帮助说明',
      content: '在首页拍摄或选择一张文字清晰的手写笔记，系统会自动识别内容并生成可编辑导图。',
      showCancel: false
    })
  },

  // 常见问题
  showFAQ() {
    wx.showModal({
      title: '常见问题',
      content: '如果生成失败，请确认图片文字清晰、云函数已部署、CLAUDE_API_KEY 已配置。',
      showCancel: false
    })
  },

  // 意见反馈
  feedback() {
    wx.showModal({
      title: '意见反馈',
      content: '可以在小程序后台配置客服能力后接入在线反馈；当前版本请先通过管理员收集反馈。',
      showCancel: false
    })
  },

  // 关于我们
  about() {
    wx.showModal({
      title: '关于思维导图小助手',
      content: '一款支持图片/文档转思维导图的工具，帮助您快速整理思路。',
      showCancel: false
    })
  },

  // 分享配置
  onShareAppMessage() {
    return {
      title: '思维导图小助手 - 一键生成思维导图',
      path: '/pages/index/index'
    }
  }
})
