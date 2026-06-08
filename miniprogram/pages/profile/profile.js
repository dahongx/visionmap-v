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
      await api.updateUserInfo(res.userInfo)

    } catch (err) {
      console.error('登录失败', err)
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
      wx.showToast({
        title: `签到成功 +${res.points}积分`,
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
