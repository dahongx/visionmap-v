const api = require('../../utils/api')

Page({
  data: {
    records: [],
    loading: false,
    page: 1,
    hasMore: true
  },

  onLoad() {
    this.loadRecords()
  },

  onShow() {
    this.loadRecords()
  },

  // 加载记录
  async loadRecords() {
    if (this.data.loading) return

    this.setData({ loading: true })
    try {
      const res = await api.getRecords(this.data.page)
      this.setData({
        records: res.data,
        loading: false,
        hasMore: res.data.length >= 10
      })
    } catch (err) {
      console.error('加载失败', err)
      this.setData({ loading: false })
    }
  },

  // 加载更多
  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return

    this.setData({ page: this.data.page + 1 })
    this.loadMoreRecords()
  },

  async loadMoreRecords() {
    try {
      const res = await api.getRecords(this.data.page)
      this.setData({
        records: [...this.data.records, ...res.data],
        hasMore: res.data.length >= 10
      })
    } catch (err) {
      console.error('加载更多失败', err)
    }
  },

  // 查看记录
  viewRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/result/result?mindmapId=${id}`
    })
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ page: 1 })
    this.loadRecords().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
