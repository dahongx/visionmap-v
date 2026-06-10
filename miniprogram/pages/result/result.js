const api = require('../../utils/api')

const H_GAP = 110
const V_GAP = 34
const EXPORT_PADDING = 80
const MAX_EXPORT_SIZE = 3000
const THEME_COLORS = ['#5b7cfa', '#7c4dba', '#1f9a8a', '#e07a3f', '#3c75d8', '#b54d8f']
const LONG_PRESS_DELAY = 320
const TAP_MOVE_TOLERANCE = 6
const DRAG_EDGE_MARGIN = 54
const AUTO_SCROLL_INTERVAL = 32

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
    exportCanvasWidth: 1,
    exportCanvasHeight: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dirty: false,
    selectedNodeId: null,
    selectedNodeText: '未选择节点'
  },

  ctx: null,
  exportCtx: null,
  layoutTree: null,
  nodePositions: {},
  mapBounds: null,
  historyStack: [],
  redoStack: [],
  touchState: null,
  drawTimer: null,
  isDrawing: false,
  pendingDraw: false,
  lastTapNodeId: null,
  lastTapTime: 0,
  longPressTimer: null,
  autoScrollTimer: null,
  autoScrollSpeedX: 0,
  autoScrollSpeedY: 0,

  onLoad(options) {
    if (options.mindmapId) {
      this.setData({ mindmapId: options.mindmapId })
      this.loadMindmap(options.mindmapId)
    }
  },

  onReady() {
    this.updateCanvasSize(() => {
      this.ctx = wx.createCanvasContext('mindmapCanvas', this)
      this.exportCtx = wx.createCanvasContext('exportCanvas', this)
      if (this.data.mindmapData) {
        this.layoutAndFit()
      }
    })
  },

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

      const mindmapData = this.normalizeMindmapData(record.resultJson)
      this.setData({
        mindmapData,
        loading: false,
        selectedNodeId: mindmapData.id,
        selectedNodeText: mindmapData.text || '根节点'
      }, () => {
        this.layoutAndFit()
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

  normalizeMindmapData(data) {
    const normalizeNode = (node, index = 0) => {
      const normalized = node && typeof node === 'object' ? node : {}
      normalized.id = normalized.id || this.createNodeId(index)
      normalized.text = normalized.text || '未命名'
      normalized.children = Array.isArray(normalized.children) ? normalized.children : []
      normalized.children = normalized.children.map((child, childIndex) => normalizeNode(child, childIndex))
      return normalized
    }

    return normalizeNode(data)
  },

  createNodeId(index = 0) {
    return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`
  },

  layoutAndFit() {
    if (!this.data.mindmapData || !this.data.canvasWidth || !this.data.canvasHeight) return

    this.layoutTree = this.buildLayoutTree(this.data.mindmapData, 0)
    this.assignNodePositions(this.layoutTree, 0, 0)
    this.mapBounds = this.calculateBounds(this.layoutTree)
    this.fitView()
  },

  relayoutAndDraw() {
    if (!this.data.mindmapData) return
    this.layoutTree = this.buildLayoutTree(this.data.mindmapData, 0)
    this.assignNodePositions(this.layoutTree, 0, 0)
    this.mapBounds = this.calculateBounds(this.layoutTree)
    this.drawMindmap()
  },

  buildLayoutTree(node, depth) {
    const text = node.text || '未命名'
    const style = this.getNodeStyle(depth)
    const lines = this.wrapText(text, style.maxChars, style.maxLines)
    const height = Math.max(style.minHeight, style.paddingY * 2 + lines.length * style.lineHeight)
    const width = Math.max(style.minWidth, Math.min(style.maxWidth, style.paddingX * 2 + this.getTextPixelWidth(lines, style.fontSize)))

    const layoutNode = {
      id: node.id,
      node,
      depth,
      text,
      lines,
      width,
      height,
      x: 0,
      y: 0,
      subtreeHeight: height,
      children: node.children.map((child) => this.buildLayoutTree(child, depth + 1))
    }

    if (layoutNode.children.length > 0) {
      const childrenHeight = layoutNode.children.reduce((sum, child) => sum + child.subtreeHeight, 0) + V_GAP * (layoutNode.children.length - 1)
      layoutNode.subtreeHeight = Math.max(height, childrenHeight)
    }

    return layoutNode
  },

  assignNodePositions(layoutNode, x, y) {
    layoutNode.x = x
    layoutNode.y = y

    if (layoutNode.children.length === 0) return

    const totalChildrenHeight = layoutNode.children.reduce((sum, child) => sum + child.subtreeHeight, 0) + V_GAP * (layoutNode.children.length - 1)
    let currentY = y - totalChildrenHeight / 2

    layoutNode.children.forEach((child) => {
      const childY = currentY + child.subtreeHeight / 2
      const childX = x + layoutNode.width / 2 + H_GAP + child.width / 2
      this.assignNodePositions(child, childX, childY)
      currentY += child.subtreeHeight + V_GAP
    })
  },

  calculateBounds(layoutNode) {
    const bounds = {
      left: layoutNode.x - layoutNode.width / 2,
      right: layoutNode.x + layoutNode.width / 2,
      top: layoutNode.y - layoutNode.height / 2,
      bottom: layoutNode.y + layoutNode.height / 2
    }

    layoutNode.children.forEach((child) => {
      const childBounds = this.calculateBounds(child)
      bounds.left = Math.min(bounds.left, childBounds.left)
      bounds.right = Math.max(bounds.right, childBounds.right)
      bounds.top = Math.min(bounds.top, childBounds.top)
      bounds.bottom = Math.max(bounds.bottom, childBounds.bottom)
    })

    return bounds
  },

  getNodeStyle(depth) {
    if (depth === 0) {
      return { minWidth: 154, maxWidth: 220, minHeight: 58, fontSize: 16, lineHeight: 21, paddingX: 22, paddingY: 13, maxChars: 8, maxLines: 2 }
    }

    if (depth === 1) {
      return { minWidth: 138, maxWidth: 240, minHeight: 50, fontSize: 15, lineHeight: 20, paddingX: 20, paddingY: 12, maxChars: 10, maxLines: 3 }
    }

    return { minWidth: 142, maxWidth: 280, minHeight: 44, fontSize: 13, lineHeight: 18, paddingX: 18, paddingY: 10, maxChars: 15, maxLines: 5 }
  },

  wrapText(text, maxChars, maxLines) {
    const source = String(text || '未命名').trim()
    const tokens = this.tokenizeText(source, maxChars)
    const lines = []
    let current = ''

    tokens.forEach((token) => {
      if (token === '\n') {
        if (current) lines.push(current)
        current = ''
        return
      }

      const next = current ? `${current}${token}` : token
      if (current && this.getVisualLength(next) > maxChars) {
        lines.push(current)
        current = token.trimStart()
      } else {
        current = next
      }
    })

    if (current) lines.push(current)
    if (lines.length <= maxLines) return lines

    const visibleLines = lines.slice(0, maxLines)
    visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1].slice(0, Math.max(1, visibleLines[maxLines - 1].length - 1))}...`
    return visibleLines
  },

  tokenizeText(text, maxChars) {
    const tokens = []
    let buffer = ''
    const isFormulaChar = (char) => /[A-Za-z0-9_+\-=<>×÷*/^²³¹₀₁₂₃₄₅₆₇₈₉()[\]{}.,，:：;；]/.test(char)
    const flush = () => {
      if (!buffer) return
      tokens.push(...this.splitLongToken(buffer, maxChars))
      buffer = ''
    }

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (char === '\n') {
        flush()
        tokens.push('\n')
      } else if (isFormulaChar(char)) {
        buffer += char
      } else {
        flush()
        tokens.push(char)
      }
    }

    flush()
    return tokens
  },

  splitLongToken(token, maxChars) {
    if (this.getVisualLength(token) <= maxChars) return [token]

    const parts = []
    let current = ''
    for (let i = 0; i < token.length; i++) {
      const next = current + token[i]
      if (current && this.getVisualLength(next) > maxChars) {
        parts.push(current)
        current = token[i]
      } else {
        current = next
      }
    }
    if (current) parts.push(current)
    return parts
  },

  getVisualLength(text) {
    let length = 0
    String(text).split('').forEach((char) => {
      if (/[A-Za-z0-9_+\-=<>×÷*/^²³¹₀₁₂₃₄₅₆₇₈₉]/.test(char)) {
        length += 0.62
      } else if (/[\x00-\xff]/.test(char)) {
        length += 0.45
      } else {
        length += 1
      }
    })
    return length
  },

  getTextPixelWidth(lines, fontSize) {
    return lines.reduce((max, line) => {
      let width = 0
      String(line).split('').forEach((char) => {
        if (/[A-Za-z0-9_+\-=<>×÷*/^²³¹₀₁₂₃₄₅₆₇₈₉]/.test(char)) {
          width += fontSize * 0.62
        } else if (/[\x00-\xff]/.test(char)) {
          width += fontSize * 0.45
        } else {
          width += fontSize
        }
      })
      return Math.max(max, width)
    }, 0)
  },

  drawMindmap() {
    if (!this.ctx || !this.layoutTree || !this.mapBounds) return
    if (this.isDrawing) {
      this.pendingDraw = true
      return
    }

    this.isDrawing = true
    const activeDrag = this.touchState && this.touchState.mode === 'nodeDrag'

    this.renderMap(this.ctx, {
      width: this.data.canvasWidth,
      height: this.data.canvasHeight,
      scale: this.data.scale,
      offsetX: this.data.offsetX,
      offsetY: this.data.offsetY,
      selectedNodeId: this.data.selectedNodeId,
      dragPreview: activeDrag ? this.touchState.dragPreview : null,
      dropHint: activeDrag ? this.touchState.dropHint : null,
      background: '#ffffff',
      done: () => {
        this.isDrawing = false
        if (this.pendingDraw) {
          this.pendingDraw = false
          this.scheduleDraw()
        }
      }
    })
  },

  scheduleDraw() {
    if (this.drawTimer) return

    this.drawTimer = setTimeout(() => {
      this.drawTimer = null
      this.drawMindmap()
    }, 16)
  },

  renderMap(ctx, options) {
    this.nodePositions = {}

    ctx.clearRect(0, 0, options.width, options.height)
    ctx.setFillStyle(options.background || '#ffffff')
    ctx.fillRect(0, 0, options.width, options.height)
    ctx.save()
    ctx.translate(options.offsetX, options.offsetY)
    ctx.scale(options.scale, options.scale)

    this.drawConnections(ctx, this.layoutTree)
    this.drawLayoutNode(ctx, this.layoutTree, options.selectedNodeId, options.dragPreview)
    this.drawDropHint(ctx, options.dropHint)
    this.drawDragPreview(ctx, options.dragPreview)

    ctx.restore()
    ctx.draw(false, () => {
      if (options.done) options.done()
    })
  },

  drawConnections(ctx, layoutNode) {
    layoutNode.children.forEach((child) => {
      const startX = layoutNode.x + layoutNode.width / 2
      const startY = layoutNode.y
      const endX = child.x - child.width / 2
      const endY = child.y
      const color = this.getDepthColor(child.depth)

      ctx.beginPath()
      ctx.setStrokeStyle(this.hexToRgba(color, child.depth === 1 ? 0.38 : 0.24))
      ctx.setLineWidth(child.depth === 1 ? 2.2 : 1.5)
      ctx.moveTo(startX, startY)
      ctx.bezierCurveTo(startX + H_GAP * 0.45, startY, endX - H_GAP * 0.45, endY, endX, endY)
      ctx.stroke()

      this.drawConnections(ctx, child)
    })
  },

  drawLayoutNode(ctx, layoutNode, selectedNodeId, dragPreview) {
    const depth = layoutNode.depth
    const isRoot = depth === 0
    const isPrimary = depth === 1
    const isSelected = layoutNode.id === selectedNodeId
    const isDragging = dragPreview && layoutNode.id === dragPreview.nodeId
    const color = this.getDepthColor(depth)
    const x = layoutNode.x - layoutNode.width / 2
    const y = layoutNode.y - layoutNode.height / 2

    this.nodePositions[layoutNode.id] = {
      x,
      y,
      width: layoutNode.width,
      height: layoutNode.height,
      depth,
      lines: layoutNode.lines,
      node: layoutNode.node
    }

    if (isDragging) {
      ctx.save()
      if (ctx.setGlobalAlpha) ctx.setGlobalAlpha(0.22)
    }

    ctx.beginPath()
    ctx.setFillStyle(isRoot || isPrimary ? color : '#ffffff')
    ctx.setStrokeStyle(isSelected ? '#111827' : (isRoot || isPrimary ? color : this.hexToRgba(color, 0.3)))
    ctx.setLineWidth(isSelected ? 3 : 1.4)
    this.roundRect(ctx, x, y, layoutNode.width, layoutNode.height, isRoot ? 8 : 7)
    ctx.fill()
    ctx.stroke()

    if (isSelected) {
      ctx.beginPath()
      ctx.setStrokeStyle(this.hexToRgba('#111827', 0.16))
      ctx.setLineWidth(6)
      this.roundRect(ctx, x - 3, y - 3, layoutNode.width + 6, layoutNode.height + 6, 10)
      ctx.stroke()
    }

    ctx.setFontSize(this.getNodeStyle(depth).fontSize)
    ctx.setFillStyle(isRoot || isPrimary ? '#ffffff' : '#273142')
    ctx.setTextAlign('center')
    ctx.setTextBaseline('middle')

    const lineHeight = this.getNodeStyle(depth).lineHeight
    const startY = layoutNode.y - ((layoutNode.lines.length - 1) * lineHeight) / 2
    layoutNode.lines.forEach((line, index) => {
      ctx.fillText(line, layoutNode.x, startY + index * lineHeight)
    })

    if (isDragging) {
      ctx.restore()
    }

    layoutNode.children.forEach((child) => this.drawLayoutNode(ctx, child, selectedNodeId, dragPreview))
  },

  drawDropHint(ctx, hint) {
    if (!hint) return

    const pos = this.nodePositions[hint.targetId]
    if (!pos) return

    const color = hint.type === 'child' ? '#16a34a' : '#5b7cfa'

    ctx.save()
    ctx.setStrokeStyle(color)
    ctx.setFillStyle(color)
    ctx.setLineWidth(2.6)

    if (hint.type === 'child') {
      this.roundRect(ctx, pos.x - 7, pos.y - 7, pos.width + 14, pos.height + 14, 10)
      ctx.stroke()

      const markerX = pos.x + pos.width + 14
      const markerY = pos.y + pos.height / 2
      ctx.beginPath()
      ctx.moveTo(pos.x + pos.width + 3, markerY)
      ctx.lineTo(markerX + 18, markerY)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(markerX + 22, markerY, 4, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const y = hint.position === 'before' ? pos.y - 12 : pos.y + pos.height + 12
      const x1 = pos.x - 18
      const x2 = pos.x + pos.width + 18

      ctx.beginPath()
      ctx.moveTo(x1, y)
      ctx.lineTo(x2, y)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x1, y, 4, 0, Math.PI * 2)
      ctx.arc(x2, y, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  },

  drawDragPreview(ctx, preview) {
    if (!preview) return

    const source = this.nodePositions[preview.nodeId]
    if (!source) return

    const depth = source.depth || 0
    const isRoot = depth === 0
    const isPrimary = depth === 1
    const width = source.width
    const height = source.height
    const x = preview.centerX - width / 2
    const y = preview.centerY - height / 2
    const color = this.getDepthColor(depth)
    const lines = source.lines || [source.node.text || '未命名']
    const style = this.getNodeStyle(depth)

    ctx.save()
    if (ctx.setGlobalAlpha) ctx.setGlobalAlpha(0.86)
    ctx.beginPath()
    ctx.setFillStyle(isRoot || isPrimary ? color : '#ffffff')
    ctx.setStrokeStyle('#111827')
    ctx.setLineWidth(2.4)
    this.roundRect(ctx, x, y, width, height, isRoot ? 8 : 7)
    ctx.fill()
    ctx.stroke()

    ctx.setFontSize(style.fontSize)
    ctx.setFillStyle(isRoot || isPrimary ? '#ffffff' : '#273142')
    ctx.setTextAlign('center')
    ctx.setTextBaseline('middle')

    const startY = preview.centerY - ((lines.length - 1) * style.lineHeight) / 2
    lines.forEach((line, index) => {
      ctx.fillText(line, preview.centerX, startY + index * style.lineHeight)
    })
    ctx.restore()
  },

  getDepthColor(depth) {
    if (depth === 0) return '#5b7cfa'
    return THEME_COLORS[(depth - 1) % THEME_COLORS.length]
  },

  hexToRgba(hex, alpha) {
    const normalized = hex.replace('#', '')
    const value = parseInt(normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized, 16)
    const r = (value >> 16) & 255
    const g = (value >> 8) & 255
    const b = value & 255
    return `rgba(${r},${g},${b},${alpha})`
  },

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

  onTouchStart(e) {
    this.clearLongPressTimer()
    this.clearAutoScrollTimer()

    if (e.touches.length === 1) {
      const touch = e.touches[0]
      const nodeId = this.getNodeAt(touch.clientX, touch.clientY)
      const canDrag = !!(nodeId && this.data.mindmapData && nodeId !== this.data.mindmapData.id)

      this.touchState = {
        mode: nodeId ? 'pendingNode' : 'pan',
        nodeId,
        canDrag,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        moved: false
      }

      if (canDrag) {
        this.longPressTimer = setTimeout(() => {
          this.startNodeDrag()
        }, LONG_PRESS_DELAY)
      }
    } else if (e.touches.length === 2) {
      this.clearLongPressTimer()
      const center = this.getTouchCenter(e.touches)
      this.touchState = {
        mode: 'pinch',
        distance: this.getTouchDistance(e.touches),
        scale: this.data.scale,
        centerX: center.x,
        centerY: center.y,
        worldX: (center.x - this.data.canvasLeft - this.data.offsetX) / this.data.scale,
        worldY: (center.y - this.data.canvasTop - this.data.offsetY) / this.data.scale,
        moved: true
      }
    }
  },

  onTouchMove(e) {
    if (!this.touchState) return

    if ((this.touchState.mode === 'pan' || this.touchState.mode === 'pendingNode') && e.touches.length === 1) {
      const touch = e.touches[0]
      const deltaX = touch.clientX - this.touchState.lastX
      const deltaY = touch.clientY - this.touchState.lastY
      const totalX = touch.clientX - this.touchState.startX
      const totalY = touch.clientY - this.touchState.startY

      if (Math.abs(totalX) > TAP_MOVE_TOLERANCE || Math.abs(totalY) > TAP_MOVE_TOLERANCE) {
        this.touchState.moved = true
        if (this.touchState.mode === 'pendingNode') {
          this.clearLongPressTimer()
          this.touchState.mode = 'pan'
        }
      }

      if (this.touchState.mode === 'pan') {
        this.data.offsetX += deltaX
        this.data.offsetY += deltaY
      }
      this.touchState.lastX = touch.clientX
      this.touchState.lastY = touch.clientY
      if (this.touchState.mode === 'pan') this.scheduleDraw()
    } else if (this.touchState.mode === 'nodeDrag' && e.touches.length === 1) {
      const touch = e.touches[0]
      this.updateNodeDrag(touch.clientX, touch.clientY)
    } else if (this.touchState.mode === 'pinch' && e.touches.length === 2) {
      const distance = this.getTouchDistance(e.touches)
      const nextScale = this.clamp(this.touchState.scale * (distance / this.touchState.distance), 0.35, 2.5)
      const screenX = this.touchState.centerX - this.data.canvasLeft
      const screenY = this.touchState.centerY - this.data.canvasTop

      this.data.scale = nextScale
      this.data.offsetX = screenX - this.touchState.worldX * nextScale
      this.data.offsetY = screenY - this.touchState.worldY * nextScale
      this.scheduleDraw()
    }
  },

  onTouchEnd(e) {
    if (!this.touchState) return

    this.clearLongPressTimer()
    this.clearAutoScrollTimer()

    if (this.touchState.mode === 'nodeDrag') {
      const draggedId = this.touchState.nodeId
      const dropHint = this.touchState.dropHint
      this.touchState = null

      this.setData({
        scale: this.data.scale,
        offsetX: this.data.offsetX,
        offsetY: this.data.offsetY
      })

      if (dropHint) {
        this.applyDropHint(draggedId, dropHint)
      } else {
        this.drawMindmap()
      }
      return
    }

    if ((this.touchState.mode === 'pan' || this.touchState.mode === 'pendingNode') && !this.touchState.moved && e.changedTouches.length === 1) {
      const touch = e.changedTouches[0]
      const selectedNodeId = this.selectNodeAt(touch.clientX, touch.clientY)
      const now = Date.now()

      if (selectedNodeId && this.lastTapNodeId === selectedNodeId && now - this.lastTapTime < 320) {
        this.lastTapNodeId = null
        this.lastTapTime = 0
        this.openEditModal(selectedNodeId)
      } else {
        this.lastTapNodeId = selectedNodeId
        this.lastTapTime = now
      }
    }

    this.setData({
      scale: this.data.scale,
      offsetX: this.data.offsetX,
      offsetY: this.data.offsetY
    })
    this.touchState = null
  },

  onTouchCancel() {
    this.clearLongPressTimer()
    this.clearAutoScrollTimer()
    this.touchState = null
    this.drawMindmap()
  },

  clearLongPressTimer() {
    if (!this.longPressTimer) return
    clearTimeout(this.longPressTimer)
    this.longPressTimer = null
  },

  clearAutoScrollTimer() {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer)
      this.autoScrollTimer = null
    }
    this.autoScrollSpeedX = 0
    this.autoScrollSpeedY = 0
  },

  startNodeDrag() {
    const state = this.touchState
    if (!state || state.mode !== 'pendingNode' || !state.canDrag) return

    const pos = this.nodePositions[state.nodeId]
    if (!pos) return

    const world = this.screenToWorld(state.lastX, state.lastY)
    state.mode = 'nodeDrag'
    state.moved = true
    state.touchOffsetX = world.x - (pos.x + pos.width / 2)
    state.touchOffsetY = world.y - (pos.y + pos.height / 2)
    state.dragPreview = {
      nodeId: state.nodeId,
      centerX: pos.x + pos.width / 2,
      centerY: pos.y + pos.height / 2
    }
    state.dropHint = null

    this.setData({
      selectedNodeId: state.nodeId,
      selectedNodeText: pos.node.text || '未命名'
    }, () => this.scheduleDraw())

    if (wx.vibrateShort) {
      wx.vibrateShort({ type: 'light' })
    }
  },

  updateNodeDrag(clientX, clientY) {
    const state = this.touchState
    if (!state || state.mode !== 'nodeDrag') return

    state.lastX = clientX
    state.lastY = clientY

    const world = this.screenToWorld(clientX, clientY)
    const centerX = world.x - state.touchOffsetX
    const centerY = world.y - state.touchOffsetY
    state.dragPreview = {
      nodeId: state.nodeId,
      centerX,
      centerY
    }
    state.dropHint = this.getDropHint(state.nodeId, centerX, centerY)

    this.updateAutoScroll(clientX, clientY)
    this.scheduleDraw()
  },

  updateAutoScroll(clientX, clientY) {
    const localX = clientX - this.data.canvasLeft
    const localY = clientY - this.data.canvasTop
    const width = this.data.canvasWidth
    const height = this.data.canvasHeight

    const toSpeed = (distance) => {
      if (distance <= 0) return 0
      return this.clamp(distance * 0.22, 4, 16)
    }

    if (localX < DRAG_EDGE_MARGIN) {
      this.autoScrollSpeedX = toSpeed(DRAG_EDGE_MARGIN - localX)
    } else if (localX > width - DRAG_EDGE_MARGIN) {
      this.autoScrollSpeedX = -toSpeed(localX - (width - DRAG_EDGE_MARGIN))
    } else {
      this.autoScrollSpeedX = 0
    }

    if (localY < DRAG_EDGE_MARGIN) {
      this.autoScrollSpeedY = toSpeed(DRAG_EDGE_MARGIN - localY)
    } else if (localY > height - DRAG_EDGE_MARGIN) {
      this.autoScrollSpeedY = -toSpeed(localY - (height - DRAG_EDGE_MARGIN))
    } else {
      this.autoScrollSpeedY = 0
    }

    if ((this.autoScrollSpeedX || this.autoScrollSpeedY) && !this.autoScrollTimer) {
      this.autoScrollTimer = setInterval(() => this.tickAutoScroll(), AUTO_SCROLL_INTERVAL)
    } else if (!this.autoScrollSpeedX && !this.autoScrollSpeedY) {
      this.clearAutoScrollTimer()
    }
  },

  tickAutoScroll() {
    if (!this.touchState || this.touchState.mode !== 'nodeDrag') {
      this.clearAutoScrollTimer()
      return
    }

    this.data.offsetX += this.autoScrollSpeedX
    this.data.offsetY += this.autoScrollSpeedY
    this.updateNodeDrag(this.touchState.lastX, this.touchState.lastY)
  },

  getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  },

  getTouchCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    }
  },

  screenToWorld(clientX, clientY) {
    return {
      x: (clientX - this.data.canvasLeft - this.data.offsetX) / this.data.scale,
      y: (clientY - this.data.canvasTop - this.data.offsetY) / this.data.scale
    }
  },

  getNodeAt(clientX, clientY, excludeNodeId) {
    const world = this.screenToWorld(clientX, clientY)
    const padding = this.clamp(10 / this.data.scale, 8, 22)
    const nodeIds = Object.keys(this.nodePositions).reverse()

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i]
      if (nodeId === excludeNodeId) continue

      const pos = this.nodePositions[nodeId]
      if (
        world.x >= pos.x - padding &&
        world.x <= pos.x + pos.width + padding &&
        world.y >= pos.y - padding &&
        world.y <= pos.y + pos.height + padding
      ) {
        return nodeId
      }
    }

    return null
  },

  getDropHint(draggedId, centerX, centerY) {
    const dragged = this.findNode(draggedId)
    if (!dragged || !dragged.parent) return null

    const scale = this.data.scale || 1
    const magnetRange = this.clamp(150 / scale, 110, 260)
    let best = null

    Object.keys(this.nodePositions).forEach((targetId) => {
      if (targetId === draggedId || this.nodeContains(dragged.node, targetId)) return

      const pos = this.nodePositions[targetId]
      const target = this.findNode(targetId)
      if (!pos || !target) return

      const targetCenterX = pos.x + pos.width / 2
      const targetCenterY = pos.y + pos.height / 2
      const distanceX = Math.abs(centerX - targetCenterX)
      const distanceY = Math.abs(centerY - targetCenterY)
      const inRange = distanceX <= pos.width / 2 + magnetRange && distanceY <= pos.height / 2 + magnetRange
      if (!inRange) return

      const sameColumn = distanceX <= Math.max(pos.width * 0.9, 100 / scale)
      const nearTop = centerY < pos.y + pos.height * 0.32
      const nearBottom = centerY > pos.y + pos.height * 0.68
      let hint = null
      let score = Infinity

      if (target.parent && sameColumn && (nearTop || nearBottom)) {
        const position = centerY < targetCenterY ? 'before' : 'after'
        const edgeY = position === 'before' ? pos.y : pos.y + pos.height
        hint = { type: 'sibling', targetId, position }
        score = distanceX * 0.55 + Math.abs(centerY - edgeY) * 1.3
      } else {
        const insideHorizontalMagnet = centerX >= pos.x - 36 / scale && centerX <= pos.x + pos.width + H_GAP * 1.12
        const insideVerticalMagnet = distanceY <= Math.max(pos.height * 0.95, 58 / scale)
        if (insideHorizontalMagnet && insideVerticalMagnet) {
          hint = { type: 'child', targetId }
          score = Math.max(0, distanceX - pos.width / 2) * 0.75 + distanceY
        }
      }

      if (!hint || this.isSameDropPlacement(dragged, hint, target)) return
      if (!best || score < best.score) {
        best = { hint, score }
      }
    })

    return best && best.score <= magnetRange * 1.35 ? best.hint : null
  },

  isSameDropPlacement(dragged, hint, target) {
    if (!dragged.parent || !target) return false

    if (hint.type === 'child') {
      return dragged.parent.id === hint.targetId && dragged.index === dragged.parent.children.length - 1
    }

    if (!target.parent || dragged.parent.id !== target.parent.id) return false

    if (hint.position === 'before') {
      return dragged.index === target.index - 1
    }

    return dragged.index === target.index + 1
  },

  applyDropHint(draggedId, hint) {
    const dragged = this.findNode(draggedId)
    if (!dragged || !dragged.parent || !hint) {
      this.drawMindmap()
      return false
    }

    const targetBeforeMove = this.findNode(hint.targetId)
    if (!targetBeforeMove || this.nodeContains(dragged.node, hint.targetId) || this.isSameDropPlacement(dragged, hint, targetBeforeMove)) {
      this.drawMindmap()
      return false
    }

    this.pushHistory()
    const movingNode = dragged.parent.children.splice(dragged.index, 1)[0]
    let inserted = false

    if (hint.type === 'child') {
      const target = this.findNode(hint.targetId)
      if (target) {
        target.node.children.push(movingNode)
        inserted = true
      }
    } else {
      const target = this.findNode(hint.targetId)
      if (target && target.parent) {
        const insertIndex = target.index + (hint.position === 'after' ? 1 : 0)
        target.parent.children.splice(insertIndex, 0, movingNode)
        inserted = true
      }
    }

    if (!inserted) {
      this.historyStack.pop()
      dragged.parent.children.splice(dragged.index, 0, movingNode)
      this.drawMindmap()
      return false
    }

    this.markDirtyAndRender(movingNode.id)
    return true
  },

  nodeContains(node, targetId) {
    if (!node || !Array.isArray(node.children)) return false

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      if (child.id === targetId || this.nodeContains(child, targetId)) return true
    }

    return false
  },

  selectNodeAt(x, y) {
    const nodeId = this.getNodeAt(x, y)

    if (nodeId) {
      const pos = this.nodePositions[nodeId]
      this.setData({
        selectedNodeId: nodeId,
        selectedNodeText: pos.node.text || '未命名'
      }, () => this.drawMindmap())
      return nodeId
    }

    return null
  },

  zoomIn() {
    this.zoomAroundCenter(1.18)
  },

  zoomOut() {
    this.zoomAroundCenter(1 / 1.18)
  },

  zoomAroundCenter(ratio) {
    const centerX = this.data.canvasWidth / 2
    const centerY = this.data.canvasHeight / 2
    const worldX = (centerX - this.data.offsetX) / this.data.scale
    const worldY = (centerY - this.data.offsetY) / this.data.scale
    const nextScale = this.clamp(this.data.scale * ratio, 0.35, 2.5)

    this.setData({
      scale: nextScale,
      offsetX: centerX - worldX * nextScale,
      offsetY: centerY - worldY * nextScale
    }, () => this.drawMindmap())
  },

  fitView() {
    if (!this.mapBounds || !this.data.canvasWidth || !this.data.canvasHeight) return

    const mapWidth = this.mapBounds.right - this.mapBounds.left
    const mapHeight = this.mapBounds.bottom - this.mapBounds.top
    const scaleX = (this.data.canvasWidth - 48) / mapWidth
    const scaleY = (this.data.canvasHeight - 48) / mapHeight
    const scale = this.clamp(Math.min(scaleX, scaleY, 1.15), 0.35, 1.15)
    const offsetX = (this.data.canvasWidth - mapWidth * scale) / 2 - this.mapBounds.left * scale
    const offsetY = (this.data.canvasHeight - mapHeight * scale) / 2 - this.mapBounds.top * scale

    this.setData({
      scale,
      offsetX,
      offsetY
    }, () => this.drawMindmap())
  },

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  },

  findNode(nodeId, node = this.data.mindmapData, parent = null, index = 0) {
    if (!node) return null
    if (node.id === nodeId) return { node, parent, index }

    for (let i = 0; i < node.children.length; i++) {
      const result = this.findNode(nodeId, node.children[i], node, i)
      if (result) return result
    }

    return null
  },

  pushHistory() {
    if (!this.data.mindmapData) return
    this.historyStack.push(JSON.parse(JSON.stringify(this.data.mindmapData)))
    if (this.historyStack.length > 30) {
      this.historyStack.shift()
    }
    this.redoStack = []
  },

  markDirtyAndRender(selectedNodeId) {
    const selected = this.findNode(selectedNodeId || this.data.selectedNodeId)
    this.setData({
      mindmapData: this.data.mindmapData,
      dirty: true,
      selectedNodeId: selected ? selected.node.id : this.data.mindmapData.id,
      selectedNodeText: selected ? selected.node.text : this.data.mindmapData.text
    }, () => this.relayoutAndDraw())
  },

  undo() {
    if (this.historyStack.length === 0) {
      wx.showToast({ title: '没有可撤销内容', icon: 'none' })
      return
    }

    this.redoStack.push(JSON.parse(JSON.stringify(this.data.mindmapData)))
    const previous = this.historyStack.pop()
    this.setData({
      mindmapData: previous,
      selectedNodeId: previous.id,
      selectedNodeText: previous.text,
      dirty: true
    }, () => this.relayoutAndDraw())
  },

  redo() {
    if (this.redoStack.length === 0) {
      wx.showToast({ title: '没有可重做内容', icon: 'none' })
      return
    }

    this.historyStack.push(JSON.parse(JSON.stringify(this.data.mindmapData)))
    const next = this.redoStack.pop()
    this.setData({
      mindmapData: next,
      selectedNodeId: next.id,
      selectedNodeText: next.text,
      dirty: true
    }, () => this.relayoutAndDraw())
  },

  openEditModal(nodeIdOrEvent, options = {}) {
    const nodeId = typeof nodeIdOrEvent === 'string' ? nodeIdOrEvent : this.data.selectedNodeId
    const target = this.findNode(nodeId)
    if (!target) {
      wx.showToast({ title: '请先选择节点', icon: 'none' })
      return
    }

    wx.showModal({
      title: '编辑节点',
      editable: true,
      placeholderText: '输入节点内容',
      content: target.node.text || '',
      confirmText: '保存',
      success: (res) => {
        if (!res.confirm) return

        const text = String(res.content || '').trim()
        if (!text) {
          wx.showToast({ title: '节点内容不能为空', icon: 'none' })
          return
        }

        if (options.pushHistory !== false) {
          this.pushHistory()
        }
        target.node.text = text
        this.markDirtyAndRender(target.node.id)
      }
    })
  },

  addNode() {
    this.addChildNode()
  },

  addChildNode() {
    const target = this.findNode(this.data.selectedNodeId)
    if (!target) {
      wx.showToast({ title: '请先选择节点', icon: 'none' })
      return
    }

    this.pushHistory()
    const newNode = {
      id: this.createNodeId(target.node.children.length),
      text: '新节点',
      children: []
    }
    target.node.children.push(newNode)
    this.markDirtyAndRender(newNode.id)
    this.openEditModal(newNode.id, { pushHistory: false })
  },

  addSiblingNode() {
    const target = this.findNode(this.data.selectedNodeId)
    if (!target || !target.parent) {
      wx.showToast({ title: '根节点不能添加同级', icon: 'none' })
      return
    }

    this.pushHistory()
    const newNode = {
      id: this.createNodeId(target.index + 1),
      text: '新节点',
      children: []
    }
    target.parent.children.splice(target.index + 1, 0, newNode)
    this.markDirtyAndRender(newNode.id)
    this.openEditModal(newNode.id, { pushHistory: false })
  },

  deleteNode() {
    const target = this.findNode(this.data.selectedNodeId)
    if (!target || !target.parent) {
      wx.showToast({ title: '根节点不能删除', icon: 'none' })
      return
    }

    wx.showModal({
      title: '删除节点',
      content: `确定删除「${target.node.text || '未命名'}」及其子节点吗？`,
      success: (res) => {
        if (!res.confirm) return

        this.pushHistory()
        target.parent.children.splice(target.index, 1)
        this.markDirtyAndRender(target.parent.id)
      }
    })
  },

  async saveMindmap() {
    if (!this.data.mindmapId || !this.data.mindmapData) return

    wx.showLoading({ title: '正在保存...' })
    try {
      const res = await api.updateMindmap(this.data.mindmapId, this.data.mindmapData)
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '保存失败')
      }

      this.setData({ dirty: false })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      console.error('保存失败', err)
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  exportImage() {
    if (!this.layoutTree || !this.mapBounds) return

    wx.showLoading({ title: '正在导出...' })

    const mapWidth = this.mapBounds.right - this.mapBounds.left
    const mapHeight = this.mapBounds.bottom - this.mapBounds.top
    const exportScale = Math.min(2, (MAX_EXPORT_SIZE - EXPORT_PADDING * 2) / mapWidth, (MAX_EXPORT_SIZE - EXPORT_PADDING * 2) / mapHeight)
    const width = Math.ceil(mapWidth * exportScale + EXPORT_PADDING * 2)
    const height = Math.ceil(mapHeight * exportScale + EXPORT_PADDING * 2)
    const offsetX = EXPORT_PADDING - this.mapBounds.left * exportScale
    const offsetY = EXPORT_PADDING - this.mapBounds.top * exportScale

    this.setData({
      exportCanvasWidth: width,
      exportCanvasHeight: height
    }, () => {
      this.exportCtx = wx.createCanvasContext('exportCanvas', this)
      this.renderMap(this.exportCtx, {
        width,
        height,
        scale: exportScale,
        offsetX,
        offsetY,
        selectedNodeId: null,
        background: '#ffffff',
        done: () => {
          wx.canvasToTempFilePath({
            canvasId: 'exportCanvas',
            width,
            height,
            destWidth: width,
            destHeight: height,
            success: (res) => {
              this.saveExportedImage(res.tempFilePath)
            },
            fail: (err) => {
              wx.hideLoading()
              console.error('导出失败', err)
              wx.showToast({ title: '导出失败', icon: 'none' })
            }
          }, this)
        }
      })
    })
  },

  saveExportedImage(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: async () => {
        wx.hideLoading()
        const synced = await this.markCurrentRecordExported()
        wx.showToast({
          title: synced ? '已保存到相册' : '图片已保存，状态未同步',
          icon: synced ? 'success' : 'none'
        })
      },
      fail: (err) => {
        wx.hideLoading()
        if (err.errMsg && err.errMsg.includes('auth deny')) {
          wx.showModal({
            title: '需要授权',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) wx.openSetting()
            }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    })
  },

  async markCurrentRecordExported() {
    if (!this.data.mindmapId) return

    try {
      const res = await api.markMindmapExported(this.data.mindmapId)
      if (!res || res.code !== 0 || res.exported !== true) {
        throw new Error((res && res.message) || '导出状态未写入')
      }
      return true
    } catch (err) {
      console.error('标记导出状态失败', err)
      return false
    }
  },

  exportPDF() {
    wx.showToast({
      title: 'PDF导出后续接网页版',
      icon: 'none'
    })
  }
})
