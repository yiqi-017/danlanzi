const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Announcement, UserAnnouncementRead, User } = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { createNotifications } = require('../utils/notificationHelper');

const router = express.Router();

function getUserIdFromReq(req) {
  return req.user && (req.user.userId || req.user.id);
}

// 根据当前时间计算状态
function deriveStatus(startsAt, endsAt, now = new Date()) {
  const starts = startsAt ? new Date(startsAt) : null;
  const ends = endsAt ? new Date(endsAt) : null;

  if (starts && now < starts) {
    return 'scheduled';
  }
  if (ends && now > ends) {
    return 'ended';
  }
  return 'active';
}

async function syncStatusIfNeeded(announcement) {
  const nextStatus = deriveStatus(announcement.starts_at, announcement.ends_at);
  if (announcement.status !== nextStatus) {
    await announcement.update({ status: nextStatus });
  }
  return nextStatus;
}

// 列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    // 先取列表，再在内存中依据当前时间调整状态并同步到DB
    const { rows, count } = await Announcement.findAndCountAll({
      limit: limitNum,
      offset,
      order: [
        ['priority', 'DESC'],
        ['starts_at', 'ASC'],
        ['created_at', 'DESC']
      ]
    });

    const now = new Date();
    const items = [];
    for (const a of rows) {
      const computed = deriveStatus(a.starts_at, a.ends_at, now);
      if (a.status !== computed) {
        await a.update({ status: computed });
      }
      items.push({
        id: a.id,
        title: a.title,
        content: a.content,
        priority: a.priority,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
        status: computed,
        created_by: a.created_by,
        created_at: a.created_at,
        updated_at: a.updated_at
      });
    }

    const filtered = status ? items.filter(i => i.status === status) : items;

    return res.json({
      status: 'success',
      message: 'Announcements retrieved successfully',
      data: {
        announcements: filtered,
        pagination: {
          total: status ? filtered.length : count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil((status ? filtered.length : count) / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('获取公告列表失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve announcements', error: error.message });
  }
});

// 获取当前用户未读公告（默认仅 active，可通过 ?status=active|scheduled|ended 指定）
router.get('/unread', authenticateToken, async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
    }
    const { page = 1, limit = 20, status = 'active' } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    // 子查询：该用户已读的公告ID
    const readRows = await UserAnnouncementRead.findAll({
      attributes: ['announcement_id'],
      where: { user_id: userId }
    });
    const readIds = readRows.map(r => r.announcement_id);

    const where = {};
    if (status) where.status = status;
    if (readIds.length > 0) {
      where.id = { [Op.notIn]: readIds };
    }

    const { rows, count } = await Announcement.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [
        ['priority', 'DESC'],
        ['starts_at', 'ASC'],
        ['created_at', 'DESC']
      ]
    });

    return res.json({
      status: 'success',
      message: 'Unread announcements retrieved successfully',
      data: {
        announcements: rows,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('获取未读公告失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve unread announcements', error: error.message });
  }
});

// 获取单条
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const a = await Announcement.findByPk(id);
    if (!a) {
      return res.status(404).json({ status: 'error', message: 'Announcement not found' });
    }

    const status = await syncStatusIfNeeded(a);
    return res.json({
      status: 'success',
      message: 'Announcement retrieved successfully',
      data: {
        announcement: {
          id: a.id,
          title: a.title,
          content: a.content,
          priority: a.priority,
          starts_at: a.starts_at,
          ends_at: a.ends_at,
          status,
          created_by: a.created_by,
          created_at: a.created_at,
          updated_at: a.updated_at
        }
      }
    });
  } catch (error) {
    console.error('获取公告失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve announcement', error: error.message });
  }
});

// 创建（管理员）
router.post('/',
  authenticateToken,
  requireAdmin,
  [
    body('title').notEmpty().withMessage('title is required'),
    body('content').optional().isString(),
    body('priority').optional().isInt({ min: 0, max: 10 }),
    body('starts_at').optional().isISO8601(),
    body('ends_at').optional().isISO8601()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }

      const { title, content, priority = 0, starts_at, ends_at } = req.body;
      const creatorUserId = req.user && (req.user.userId || req.user.id);
      if (!creatorUserId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const announcement = await Announcement.create({
        title,
        content,
        priority,
        starts_at: starts_at ? new Date(starts_at) : null,
        ends_at: ends_at ? new Date(ends_at) : null,
        status: deriveStatus(starts_at, ends_at),
        created_by: creatorUserId
      });

      // 如果公告状态是active，通知所有用户
      if (announcement.status === 'active') {
        const allUsers = await User.findAll({
          attributes: ['id'],
          where: { status: 'active' }
        });
        
        if (allUsers.length > 0) {
          const notifications = allUsers.map(user => ({
            user_id: user.id,
            type: 'announcement',
            title: announcement.title,
            content: announcement.content || null,
            entity_type: 'announcement',
            entity_id: announcement.id
          }));
          await createNotifications(notifications);
        }
      }

      return res.status(201).json({
        status: 'success',
        message: 'Announcement created successfully',
        data: { announcement }
      });
    } catch (error) {
      console.error('创建公告失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to create announcement', error: error.message });
    }
  }
);

// 更新（管理员）
router.put('/:id',
  authenticateToken,
  requireAdmin,
  [
    body('title').optional().notEmpty(),
    body('content').optional().isString(),
    body('priority').optional().isInt({ min: 0, max: 10 }),
    body('starts_at').optional().isISO8601(),
    body('ends_at').optional().isISO8601()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }

      const { id } = req.params;
      const { title, content, priority, starts_at, ends_at } = req.body;

      const a = await Announcement.findByPk(id);
      if (!a) {
        return res.status(404).json({ status: 'error', message: 'Announcement not found' });
      }

      const nextStarts = starts_at !== undefined ? (starts_at ? new Date(starts_at) : null) : a.starts_at;
      const nextEnds = ends_at !== undefined ? (ends_at ? new Date(ends_at) : null) : a.ends_at;

      await a.update({
        title: title !== undefined ? title : a.title,
        content: content !== undefined ? content : a.content,
        priority: priority !== undefined ? priority : a.priority,
        starts_at: nextStarts,
        ends_at: nextEnds,
        status: deriveStatus(nextStarts, nextEnds)
      });

      return res.json({
        status: 'success',
        message: 'Announcement updated successfully',
        data: { announcement: a }
      });
    } catch (error) {
      console.error('更新公告失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to update announcement', error: error.message });
    }
  }
);

// 删除（管理员）
router.delete('/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const a = await Announcement.findByPk(id);
      if (!a) {
        return res.status(404).json({ status: 'error', message: 'Announcement not found' });
      }
      await a.destroy();
      return res.json({ status: 'success', message: 'Announcement deleted successfully' });
    } catch (error) {
      console.error('删除公告失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to delete announcement', error: error.message });
    }
  }
);

// 标记为已读（幂等）
router.post('/:id/read', authenticateToken, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.id);
    if (!Number.isFinite(announcementId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid announcement id' });
    }
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
    }

    const a = await Announcement.findByPk(announcementId);
    if (!a) {
      return res.status(404).json({ status: 'error', message: 'Announcement not found' });
    }

    const [record, created] = await UserAnnouncementRead.findOrCreate({
      where: { announcement_id: announcementId, user_id: userId },
      defaults: { announcement_id: announcementId, user_id: userId, read_at: new Date() }
    });

    return res.status(created ? 201 : 200).json({
      status: 'success',
      message: created ? 'Marked as read' : 'Already marked as read',
      data: { read: true, read_at: record.read_at }
    });
  } catch (error) {
    console.error('标记公告为已读失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to mark as read', error: error.message });
  }
});

// 获取当前用户阅读状态
router.get('/:id/read-status', authenticateToken, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.id);
    if (!Number.isFinite(announcementId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid announcement id' });
    }
    const userId = getUserIdFromReq(req);
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
    }

    const a = await Announcement.findByPk(announcementId);
    if (!a) {
      return res.status(404).json({ status: 'error', message: 'Announcement not found' });
    }

    const record = await UserAnnouncementRead.findOne({
      where: { announcement_id: announcementId, user_id: userId }
    });

    return res.json({
      status: 'success',
      message: 'Read status retrieved',
      data: { read: !!record, read_at: record ? record.read_at : null }
    });
  } catch (error) {
    console.error('获取阅读状态失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get read status', error: error.message });
  }
});

// 获取阅读者列表（管理员）
router.get('/:id/readers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const announcementId = parseInt(req.params.id);
    if (!Number.isFinite(announcementId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid announcement id' });
    }

    const a = await Announcement.findByPk(announcementId);
    if (!a) {
      return res.status(404).json({ status: 'error', message: 'Announcement not found' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const { count, rows } = await UserAnnouncementRead.findAndCountAll({
      where: { announcement_id: announcementId },
      order: [['read_at', 'DESC']],
      limit,
      offset
    });

    return res.json({
      status: 'success',
      message: 'Readers retrieved successfully',
      data: {
        readers: rows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取阅读者列表失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get readers', error: error.message });
  }
});

// 获取阅读总数
router.get('/:id/read-count', async (req, res) => {
  try {
    const announcementId = parseInt(req.params.id);
    if (!Number.isFinite(announcementId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid announcement id' });
    }

    const a = await Announcement.findByPk(announcementId);
    if (!a) {
      return res.status(404).json({ status: 'error', message: 'Announcement not found' });
    }

    const count = await UserAnnouncementRead.count({ where: { announcement_id: announcementId } });
    return res.json({ status: 'success', message: 'Read count retrieved', data: { count } });
  } catch (error) {
    console.error('获取阅读总数失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to get read count', error: error.message });
  }
});

module.exports = router;


