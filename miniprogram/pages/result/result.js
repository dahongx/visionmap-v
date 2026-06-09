const api = require('../../utils/api')

Page({
  data: {
    mindmapId: null,
    mindmapData: null,
    loading: false,
    loadingText: '正在加载...',
    canvasWidth: 0,
    canvasHeight: 0,
    canvasLeft: 0,
    canvasTop: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    showEditModal: false,
    editingNode: null,
    selectedNodeId: null
  },

  // 画布上下文
  ctx: null,
  // 触摸相关
  lastTouchDistance: 0,
  lastTouchX: 0,
  lastTouchY: 0,
  // 节点位置缓存
  nodePositions: {},

  onLoad(options) {
    if (options.mindmapId) {
      this.setData({ mindmapId: options.mindmapId })
      this.loadMindmap(options.mindmapId)
    }
  },

  onReady() {
    this.updateCanvasSize(() => {
      if (this.data.mindmapData) {
        this.initCanvas()
      }
    })
  },

  // 获取画布尺寸
  updateCanvasSize(callback) {
    const query = wx.createSelectorQuery()
    query.select('.mindmap-canvas').boundingClientRect((rect) => {
      if (!rect) return

      this.setData({
        canvasWidth: rect.width,
        canvasHeight: rect.height,
        canvasLeft: rect.left || 0,
        canvasTop: rect.top || 0
      }, () => {
        if (callback) callback()
      })
    }).exec()
  },

  // 加载思维导图
  async loadMindmap(mindmapId) {
    this.setData({ loading: true })
    try {
      const record = await api.getMindmap(mindmapId)

      if (record.status === 'failed') {
        throw new Error(record.error || '生成失败')
      }

      if (!record.resultJson) {
        throw new Error(record.status === 'processing' ? '导图仍在生成中，请稍后再试' : '导图数据为空')
      }

      this.setData({
        mindmapData: record.resultJson,
        loading: false
      }, () => {
        this.initCanvas()
      })
    } catch (err) {
      console.error('加载失败', err)
      this.setData({ loading: false })
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
    }
  },

  // 初始化画布
  initCanvas() {
    this.ctx = wx.createCanvasContext('mindmapCanvas', this)
    this.drawMindmap()
  },

  // 绘制思维导图
  drawMindmap() {
    if (!this.ctx || !this.data.mindmapData) return

    if (!this.data.canvasWidth || !this.data.canvasHeight) {
      this.updateCanvasSize(() => {
        this.drawMindmap()
      })
      return
    }

    const ctx = this.ctx
    const data = this.data.mindmapData
    const centerX = this.data.canvasWidth / 2
    const centerY = this.data.canvasHeight / 2

    this.nodePositions = {}

    // 清空画布
    ctx.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight)

    // 保存状态
    ctx.save()

    // 应用缩放和偏移
    ctx.translate(this.data.offsetX, this.data.offsetY)
    ctx.scale(this.data.scale, this.data.scale)

    // 绘制节点
    this.drawNode(ctx, data, centerX, centerY, 0)

    // 恢复状态
    ctx.restore()

    // 提交绘制
    ctx.draw()
  },

  // 绘制单个节点
  drawNode(ctx, node, x, y, depth) {
    if (!node) return

    const isRoot = depth === 0
    const nodeWidth = isRoot ? 160 : 120
    const nodeHeight = isRoot ? 60 : 40
    const fontSize = isRoot ? 16 : 14
    const bgColor = isRoot ? '#667eea' : (depth === 1 ? '#764ba2' : '#ffffff')
    const textColor = isRoot ? '#ffffff' : (depth === 1 ? '#ffffff' : '#333333')
    const borderColor = isRoot ? '#667eea' : (depth === 1 ? '#764ba2' : '#e8e8e8')

    // 保存节点位置
    this.nodePositions[node.id] = {
      x: x - nodeWidth / 2,
      y: y - nodeHeight / 2,
      width: nodeWidth,
      height: nodeHeight,
      node: node
    }

    // 绘制圆角矩形
    ctx.beginPath()
    ctx.setFillStyle(bgColor)
    ctx.setStrokeStyle(borderColor)
    ctx.setLineWidth(2)
    this.roundRect(ctx, x - nodeWidth / 2, y - nodeHeight / 2, nodeWidth, nodeHeight, 8)
    ctx.fill()
    ctx.stroke()

    // 绘制文字
    ctx.setFontSize(fontSize)
    ctx.setFillStyle(textColor)
    ctx.setTextAlign('center')
    ctx.setTextBaseline('middle')

    // 文字截断处理
    let text = node.text || ''
    if (text.length > 8) {
      text = text.substring(0, 8) + '...'
    }
    ctx.fillText(text, x, y)

    // 绘制子节点
    if (node.children && node.children.length > 0) {
      const childCount = node.children.length
      const spacing = 80
      const startY = y - ((childCount - 1) * spacing) / 2

      node.children.forEach((child, index) => {
        const childY = startY + index * spacing
        const childX = x + 180

        // 绘制连接线
        ctx.beginPath()
        ctx.setStrokeStyle('#d9d9d9')
        ctx.setLineWidth(2)
        ctx.moveTo(x + nodeWidth / 2, y)
        ctx.bezierCurveTo(
          x + nodeWidth / 2 + 40, y,
          childX - 40, childY,
          childX - nodeWidth / 2, childY
        )
        ctx.stroke()

        // 递归绘制子节点
        this.drawNode(ctx, child, childX, childY, depth + 1)
      })
    }
  },

  // 绘制圆角矩形
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  },

  // 触摸开始
  onTouchStart(e) {
    if (e.touches.length === 1) {
      this.lastTouchX = e.touches[0].clientX
      this.lastTouchY = e.touches[0].clientY
    } else if (e.touches.length === 2) {
      this.lastTouchDistance = this.getTouchDistance(e.touches)
    }
  },

  // 触摸移动
  onTouchMove(e) {
    if (e.touches.length === 1) {
      // 拖拽移动
      const deltaX = e.touches[0].clientX - this.lastTouchX
      const deltaY = e.touches[0].clientY - this.lastTouchY

      this.setData({
        offsetX: this.data.offsetX + deltaX,
        offsetY: this.data.offsetY + deltaY
      })

      this.lastTouchX = e.touches[0].clientX
      this.lastTouchY = e.touches[0].clientY

      this.drawMindmap()
    } else if (e.touches.length === 2) {
      // 双指缩放
      const distance = this.getTouchDistance(e.touches)
      const scale = distance / this.lastTouchDistance

      this.setData({
        scale: Math.max(0.5, Math.min(2, this.data.scale * scale))
      })

      this.lastTouchDistance = distance

      this.drawMindmap()
    }
  },

  // 触摸结束
  onTouchEnd(e) {
    // 检查是否点击了节点
    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0]
      this.checkNodeClick(touch.clientX, touch.clientY)
    }
  },

  // 获取触摸点距离
  getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  },

  // 检查是否点击了节点
  checkNodeClick(x, y) {
    // 转换为画布坐标
    const canvasX = (x - this.data.canvasLeft - this.data.offsetX) / this.data.scale
    const canvasY = (y - this.data.canvasTop - this.data.offsetY) / this.data.scale

    // 检查是否在节点范围内
    for (const nodeId in this.nodePositions) {
      const pos = this.nodePositions[nodeId]
      if (
        canvasX >= pos.x &&
        canvasX <= pos.x + pos.width &&
        canvasY >= pos.y &&
        canvasY <= pos.y + pos.height
      ) {
        this.setData({
          selectedNodeId: nodeId,
          showEditModal: true,
          editingNode: pos.node
        })
        break
      }
    }
  },

  // 放大
  zoomIn() {
    this.setData({
      scale: Math.min(2, this.data.scale * 1.2)
    })
    this.drawMindmap()
  },

  // 缩小
  zoomOut() {
    this.setData({
      scale: Math.max(0.5, this.data.scale / 1.2)
    })
    this.drawMindmap()
  },

  // 适应窗口
  fitView() {
    this.setData({
      scale: 1,
      offsetX: 0,
      offsetY: 0
    })
    this.drawMindmap()
  },

  // 撤销
  undo() {
    wx.showToast({
      title: '撤销功能开发中',
      icon: 'none'
    })
  },

  // 重做
  redo() {
    wx.showToast({
      title: '重做功能开发中',
      icon: 'none'
    })
  },

  // 添加节点
  addNode() {
    wx.showToast({
      title: '请先选择一个节点',
      icon: 'none'
    })
  },

  // 编辑节点输入
  onNodeInput(e) {
    this.setData({
      'editingNode.text': e.detail.value
    })
  },

  // 取消编辑
  cancelEdit() {
    this.setData({
      showEditModal: false,
      editingNode: null,
      selectedNodeId: null
    })
  },

  // 确认编辑
  confirmEdit() {
    const { selectedNodeId, editingNode, mindmapData } = this.data

    // 更新节点数据
    const updateNode = (node) => {
      if (node.id === selectedNodeId) {
        node.text = editingNode.text
        return true
      }
      if (node.children) {
        for (let child of node.children) {
          if (updateNode(child)) return true
        }
      }
      return false
    }

    updateNode(mindmapData)

    this.setData({
      mindmapData,
      showEditModal: false,
      editingNode: null,
      selectedNodeId: null
    })

    // 重新绘制
    this.drawMindmap()

    wx.showToast({
      title: '修改成功',
      icon: 'success'
    })
  },

  // 导出图片
  exportImage() {
    wx.showLoading({ title: '正在导出...' })

    // 临时导出为图片
    wx.canvasToTempFilePath({
      canvasId: 'mindmapCanvas',
      success: (res) => {
        wx.hideLoading()
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.showToast({
              title: '已保存到相册',
              icon: 'success'
            })
          },
          fail: (err) => {
            if (err.errMsg.includes('auth deny')) {
              wx.showModal({
                title: '需要授权',
                content: '请在设置中允许保存图片到相册',
                confirmText: '去设置',
                success: (res) => {
                  if (res.confirm) {
                    wx.openSetting()
                  }
                }
              })
            } else {
              wx.showToast({
                title: '保存失败',
                icon: 'none'
              })
            }
          }
        })
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('导出失败', err)
        wx.showToast({
          title: '导出失败',
          icon: 'none'
        })
      }
    }, this)
  },

  // 导出PDF
  exportPDF() {
    wx.showToast({
      title: 'PDF导出功能开发中',
      icon: 'none'
    })
  }
})
