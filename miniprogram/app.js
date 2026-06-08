App({
  onLaunch: function () {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-d1gzgjubbf737004f',
        traceUser: true,
      })
    }

    // 获取用户信息
    this.globalData = {}
  },

  globalData: {
    userInfo: null,
    openid: null
  }
})
