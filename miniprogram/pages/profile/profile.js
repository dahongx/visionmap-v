const app = getApp()
const api = require('../../utils/api')

Page({
  data: {
    user: null,
    profileForm: {
      nickName: '',
      avatarUrl: ''
    },
    avatarText: '我',
    points: 0,
    pointLogs: [],
    accountReady: false,
    loadingAccount: false,
    savingProfile: false
  },

  onLoad() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    this.loadAccount()
  },

  onShow() {
    if (this.data.accountReady) {
      this.loadAccount({ silent: true })
    }
  },

  async loadAccount(options = {}) {
    if (this.data.loadingAccount) return

    this.setData({ loadingAccount: !options.silent })

    try {
      const res = await api.getUserProfile()
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '账号初始化失败')
      }

      this.applyUser(res.user, res.points)
      app.globalData.user = res.user
      app.globalData.userInfo = res.user
      this.loadPointLogs()
      return true
    } catch (err) {
      console.error('账号加载失败', err)
      wx.showToast({
        title: err.message || '账号加载失败',
        icon: 'none'
      })
      return false
    } finally {
      this.setData({ loadingAccount: false })
    }
  },

  applyUser(user, points) {
    const nextUser = user || {}
    const nickName = nextUser.nickName || ''
    const avatarUrl = nextUser.avatarUrl || ''

    this.setData({
      user: nextUser,
      profileForm: {
        nickName,
        avatarUrl
      },
      avatarText: this.getAvatarText(nickName),
      points: Number(points != null ? points : nextUser.points) || 0,
      accountReady: true
    })
  },

  getAvatarText(nickName) {
    const text = String(nickName || '').trim()
    return text ? text.slice(0, 1) : '我'
  },

  async login() {
    try {
      const ok = await this.loadAccount()
      if (ok) {
        wx.showToast({
          title: '已登录',
          icon: 'success'
        })
      }
    } catch (err) {
      console.error('登录失败', err)
    }
  },

  onNicknameInput(e) {
    this.setData({
      'profileForm.nickName': e.detail.value,
      avatarText: this.getAvatarText(e.detail.value)
    })
  },

  async onChooseAvatar(e) {
    const avatarPath = e.detail && e.detail.avatarUrl
    if (!avatarPath) return

    wx.showLoading({ title: '正在保存头像' })
    try {
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: avatarPath
      })

      this.setData({
        'profileForm.avatarUrl': uploadRes.fileID
      })

      await this.saveProfile({ silent: true })
      wx.hideLoading()
      wx.showToast({
        title: '头像已保存',
        icon: 'success'
      })
    } catch (err) {
      console.error('头像保存失败', err)
      wx.hideLoading()
      wx.showToast({
        title: err.message || '头像保存失败',
        icon: 'none'
      })
    }
  },

  async saveProfile(options = {}) {
    if (this.data.savingProfile) return

    const profile = {
      nickName: String(this.data.profileForm.nickName || '').trim(),
      avatarUrl: this.data.profileForm.avatarUrl || ''
    }

    if (!profile.nickName && !profile.avatarUrl) {
      wx.showToast({
        title: '请填写昵称或头像',
        icon: 'none'
      })
      return
    }

    this.setData({ savingProfile: true })

    try {
      const res = await api.updateUserProfile(profile)
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '资料保存失败')
      }

      this.applyUser(res.user, res.points)
      app.globalData.user = res.user
      app.globalData.userInfo = res.user

      if (!options.silent) {
        wx.showToast({
          title: '已保存',
          icon: 'success'
        })
      }
    } catch (err) {
      console.error('资料保存失败', err)
      wx.showToast({
        title: err.message || '资料保存失败',
        icon: 'none'
      })
    } finally {
      this.setData({ savingProfile: false })
    }
  },

  async loadPointLogs() {
    try {
      const res = await api.getPointLogs(6)
      if (!res || res.code !== 0) return

      this.setData({
        pointLogs: (res.data || []).map((item) => ({
          ...item,
          changeText: item.change > 0 ? `+${item.change}` : `${item.change}`,
          changeClass: item.change > 0 ? 'plus' : 'minus',
          createdAtText: this.formatDate(item.createdAt)
        }))
      })
    } catch (err) {
      console.error('积分流水加载失败', err)
    }
  },

  async signIn() {
    try {
      const res = await api.signIn()
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '签到失败')
      }

      this.setData({ points: res.points })
      this.loadPointLogs()
      wx.showToast({
        title: `签到成功 +${res.added || 5}`,
        icon: 'success'
      })
    } catch (err) {
      console.error('签到失败', err)
      wx.showToast({
        title: err.message || '签到失败',
        icon: 'none'
      })
    }
  },

  inviteFriend() {
    wx.showModal({
      title: '邀请好友',
      content: '当前版本已支持分享入口，邀请奖励会在积分充值体系确定后启用。',
      showCancel: false
    })
  },

  showHistory() {
    wx.switchTab({
      url: '/pages/history/history'
    })
  },

  showHelp() {
    wx.showModal({
      title: '帮助说明',
      content: '首页上传图片或文档后，系统会生成可编辑思维导图；生成记录会保存在当前微信账号下。',
      showCancel: false
    })
  },

  showFAQ() {
    wx.showModal({
      title: '常见问题',
      content: '如果生成失败，请确认图片文字清晰、云函数已部署、AI 接口密钥已配置。',
      showCancel: false
    })
  },

  feedback() {
    wx.showModal({
      title: '意见反馈',
      content: '当前体验版请先由管理员收集反馈；正式发布前可接入微信客服能力。',
      showCancel: false
    })
  },

  about() {
    wx.showModal({
      title: '关于思维导图小助手',
      content: '支持图片、文档生成可编辑思维导图，用于学习笔记和资料整理。',
      showCancel: false
    })
  },

  formatDate(value) {
    if (!value) return ''

    let date
    if (value instanceof Date) {
      date = value
    } else if (typeof value === 'string' || typeof value === 'number') {
      date = new Date(value)
    } else if (value.$date) {
      date = new Date(value.$date)
    }

    if (!date || Number.isNaN(date.getTime())) return ''

    const pad = (num) => String(num).padStart(2, '0')
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  },

  onShareAppMessage() {
    return {
      title: '思维导图小助手 - 一键生成可编辑导图',
      path: '/pages/index/index'
    }
  }
})
