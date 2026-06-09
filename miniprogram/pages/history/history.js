const api = require('../../utils/api')

Page({
  data: {
    records: [],
    loading: false,
    page: 1,
    hasMore: true
  },

  onLoad() {
    this.refreshRecords()
  },

  onShow() {
    this.refreshRecords()
  },

  // 加载记录
  async loadRecords(page = this.data.page) {
    if (this.data.loading) return Promise.resolve()

    this.setData({ loading: true })
    try {
      const res = await api.getRecords(page)
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '加载记录失败')
      }

      this.setData({
        records: res.data || [],
        loading: false,
        page,
        hasMore: res.hasMore !== undefined ? res.hasMore : (res.data || []).length >= 10
      })
    } catch (err) {
      console.error('加载失败', err)
      this.setData({ loading: false })
    }
  },

  // 刷新记录
  refreshRecords() {
    return this.loadRecords(1)
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
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '加载更多失败')
      }

      const data = res.data || []
      this.setData({
        records: [...this.data.records, ...data],
        hasMore: res.hasMore !== undefined ? res.hasMore : data.length >= 10
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
    this.refreshRecords().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
