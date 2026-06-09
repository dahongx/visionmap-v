const api = require('../../utils/api')

Page({
  data: {
    records: [],
    loading: false,
    page: 1,
    hasMore: true,
    activeFilter: 'all',
    emptyText: '还没有导图记录',
    emptyDesc: '去首页拍一张手写笔记吧'
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
      const res = await api.getRecords(page, 10, this.data.activeFilter)
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '加载记录失败')
      }
      if (res.action !== 'list' || res.filter !== this.data.activeFilter || !Array.isArray(res.data)) {
        throw new Error('记录服务未更新，请重新部署 get-record 云函数')
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

  // 切换筛选
  changeFilter(e) {
    const filter = e.currentTarget.dataset.filter
    if (!filter || filter === this.data.activeFilter) return

    this.setData({
      activeFilter: filter,
      page: 1,
      records: [],
      hasMore: true,
      ...this.getEmptyCopy(filter)
    }, () => {
      this.refreshRecords()
    })
  },

  getEmptyCopy(filter) {
    if (filter === 'edited') {
      return {
        emptyText: '还没有编辑过的导图',
        emptyDesc: '进入导图页修改并保存后，会出现在这里'
      }
    }

    if (filter === 'exported') {
      return {
        emptyText: '还没有导出过的导图',
        emptyDesc: '导出完整图片后，会出现在这里'
      }
    }

    return {
      emptyText: '还没有导图记录',
      emptyDesc: '去首页拍一张手写笔记吧'
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
      const res = await api.getRecords(this.data.page, 10, this.data.activeFilter)
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '加载更多失败')
      }
      if (res.action !== 'list' || res.filter !== this.data.activeFilter || !Array.isArray(res.data)) {
        throw new Error('记录服务未更新，请重新部署 get-record 云函数')
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
    const status = e.currentTarget.dataset.status

    if (status === 'failed') {
      wx.showToast({ title: '这条记录生成失败，建议删除后重试', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: `/pages/result/result?mindmapId=${id}`
    })
  },

  // 删除记录
  deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    const title = e.currentTarget.dataset.title || '这条记录'

    wx.showModal({
      title: '删除记录',
      content: `确定删除「${title}」吗？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#c24141',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '正在删除...' })
        try {
          const deleteRes = await api.deleteRecord(id)
          if (!deleteRes || deleteRes.code !== 0 || deleteRes.deleted !== true) {
            throw new Error((deleteRes && deleteRes.message) || '删除失败')
          }

          wx.showToast({ title: '已删除', icon: 'success' })
          this.refreshRecords()
        } catch (err) {
          console.error('删除失败', err)
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.refreshRecords().then(() => {
      wx.stopPullDownRefresh()
    })
  }
})
