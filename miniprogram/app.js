const api = require('./utils/api')

App({
  globalData: {
    user: null,
    userInfo: null,
    openid: null
  },

  userReadyPromise: null,

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    wx.cloud.init({
      env: 'cloud1-d1gzgjubbf737004f',
      traceUser: true
    })

    this.initUser()
  },

  initUser() {
    if (this.userReadyPromise) return this.userReadyPromise

    this.userReadyPromise = api.initUser()
      .then((res) => {
        if (!res || res.code !== 0) {
          throw new Error((res && res.message) || '用户初始化失败')
        }

        this.globalData.user = res.user
        this.globalData.userInfo = res.user
        return res.user
      })
      .catch((err) => {
        this.userReadyPromise = null
        console.error('用户初始化失败', err)
        throw err
      })

    return this.userReadyPromise
  },

  refreshUser() {
    this.userReadyPromise = null
    return this.initUser()
  }
})
