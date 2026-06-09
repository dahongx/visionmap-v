const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { action = 'detail', recordId, page = 1, pageSize = 10, mindmapData, filter = 'all' } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const db = cloud.database()
    const recordsCollection = db.collection('records')

    if (action === 'list') {
      const currentPage = Math.max(Number(page) || 1, 1)
      const currentPageSize = Math.min(Math.max(Number(pageSize) || 10, 1), 50)
      const _ = db.command
      const query = { userId: openid }

      if (filter === 'edited') {
        query.updatedAt = _.exists(true)
      } else if (filter === 'exported') {
        query.isExported = true
      }

      const orderField = filter === 'edited' ? 'updatedAt' : (filter === 'exported' ? 'exportedAt' : 'createdAt')
      const res = await recordsCollection
        .where(query)
        .orderBy(orderField, 'desc')
        .skip((currentPage - 1) * currentPageSize)
        .limit(currentPageSize)
        .get()

      return {
        code: 0,
        action: 'list',
        data: res.data.map(formatRecordForClient),
        page: currentPage,
        pageSize: currentPageSize,
        filter,
        hasMore: res.data.length >= currentPageSize
      }
    }

    if (!recordId) {
      return {
        code: -1,
        message: '缺少记录ID'
      }
    }

    const res = await recordsCollection.doc(recordId).get()
    const record = res.data

    if (!record) {
      return {
        code: -1,
        message: '记录不存在'
      }
    }

    if (record.userId !== openid) {
      return {
        code: -1,
        message: '无权访问此记录'
      }
    }

    if (action === 'update') {
      if (!mindmapData || typeof mindmapData !== 'object') {
        return {
          code: -1,
          message: '导图数据为空'
        }
      }

      const _ = db.command
      await recordsCollection.doc(recordId).update({
        data: {
          title: getMindmapTitle(mindmapData),
          resultJson: _.set(mindmapData),
          updatedAt: db.serverDate()
        }
      })

      return {
        code: 0,
        action: 'update',
        updated: true,
        message: '保存成功'
      }
    }

    if (action === 'markExported') {
      const _ = db.command
      await recordsCollection.doc(recordId).update({
        data: {
          isExported: true,
          exportedAt: db.serverDate(),
          exportCount: _.inc(1)
        }
      })

      return {
        code: 0,
        action: 'markExported',
        exported: true,
        message: '已标记导出'
      }
    }

    if (action === 'delete') {
      await recordsCollection.doc(recordId).remove()

      return {
        code: 0,
        action: 'delete',
        deleted: true,
        message: '删除成功'
      }
    }

    return {
      code: 0,
      data: formatRecordForClient(record)
    }
  } catch (err) {
    console.error('查询记录失败', err)
    return {
      code: -1,
      message: err.message || '查询失败'
    }
  }
}

function formatRecordForClient(record) {
  const createdAtText = formatDate(record.createdAt)
  const completedAtText = formatDate(record.completedAt)
  const updatedAtText = formatDate(record.updatedAt)
  const exportedAtText = formatDate(record.exportedAt)

  return {
    ...record,
    title: record.title || getRecordTitle(record),
    createdAt: createdAtText || record.createdAt,
    completedAt: completedAtText || record.completedAt,
    updatedAt: updatedAtText || record.updatedAt,
    exportedAt: exportedAtText || record.exportedAt,
    createdAtText,
    completedAtText,
    updatedAtText,
    exportedAtText
  }
}

function getRecordTitle(record) {
  const title = getMindmapTitle(record.resultJson)
  if (title) {
    return title
  }

  if (record.status === 'processing') {
    return '正在生成导图'
  }

  if (record.status === 'failed') {
    return '生成失败'
  }

  return '未命名导图'
}

function getMindmapTitle(mindmapData) {
  if (mindmapData && typeof mindmapData.text === 'string' && mindmapData.text.trim()) {
    return mindmapData.text.trim()
  }

  return ''
}

function formatDate(value) {
  if (!value) return ''

  let date
  if (value instanceof Date) {
    date = value
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value)
  } else if (value.$date) {
    date = new Date(value.$date)
  }

  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
