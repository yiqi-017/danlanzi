const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Notification, User } = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function getUserIdFromReq(req) {
  return req.user && (req.user.userId || req.user.id);
}

// 创建通知（管理员或系统）
router.post('/',
  authenticateToken,
  requireAdmin,
  [
    body('user_id').isInt({ min: 1 }).withMessage('user_id must be a positive integer'),
    body('type').isIn(['system', 'resource', 'review', 'comment', 'announcement']).withMessage('type must be one of: system, resource, review, comment, announcement'),
    body('title').optional().isString().isLength({ max: 255 }).withMessage('title must be a string with max length 255'),
    body('content').optional().isString().withMessage('content must be a string'),
    body('entity_type').optional().isString().isLength({ max: 50 }).withMessage('entity_type must be a string with max length 50'),
    body('entity_id').optional().isInt({ min: 1 }).withMessage('entity_id must be a positive integer'),
    body('is_read').optional().isBoolean().withMessage('is_read must be a boolean')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }

      const { user_id, type, title, content, entity_type, entity_id, is_read = false } = req.body;

      // 验证用户是否存在
      const user = await User.findByPk(user_id);
      if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      const notification = await Notification.create({
        user_id,
        type,
        title: title || null,
        content: content || null,
        entity_type: entity_type || null,
        entity_id: entity_id || null,
        is_read
      });

      return res.status(201).json({
        status: 'success',
        message: 'Notification created successfully',
        data: { notification }
      });
    } catch (error) {
      console.error('创建通知失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to create notification', error: error.message });
    }
  }
);

// 批量创建通知（管理员）
router.post('/batch',
  authenticateToken,
  requireAdmin,
  [
    body('user_ids').isArray({ min: 1 }).withMessage('user_ids must be a non-empty array'),
    body('user_ids.*').isInt({ min: 1 }).withMessage('Each user_id must be a positive integer'),
    body('type').isIn(['system', 'resource', 'review', 'comment', 'announcement']).withMessage('type must be one of: system, resource, review, comment, announcement'),
    body('title').optional().isString().isLength({ max: 255 }).withMessage('title must be a string with max length 255'),
    body('content').optional().isString().withMessage('content must be a string'),
    body('entity_type').optional().isString().isLength({ max: 50 }).withMessage('entity_type must be a string with max length 50'),
    body('entity_id').optional().isInt({ min: 1 }).withMessage('entity_id must be a positive integer')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }

      const { user_ids, type, title, content, entity_type, entity_id } = req.body;

      // 验证所有用户是否存在
      const users = await User.findAll({
        where: { id: { [Op.in]: user_ids } }
      });

      if (users.length !== user_ids.length) {
        return res.status(400).json({ status: 'error', message: 'Some user_ids do not exist' });
      }

      // 批量创建通知
      const notifications = await Notification.bulkCreate(
        user_ids.map(user_id => ({
          user_id,
          type,
          title: title || null,
          content: content || null,
          entity_type: entity_type || null,
          entity_id: entity_id || null,
          is_read: false
        }))
      );

      return res.status(201).json({
        status: 'success',
        message: 'Notifications created successfully',
        data: { 
          notifications,
          count: notifications.length
        }
      });
    } catch (error) {
      console.error('批量创建通知失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to create notifications', error: error.message });
    }
  }
);

// 获取当前用户的通知列表
router.get('/',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const { page = 1, limit = 20, is_read, type } = req.query;
      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 20, 100);
      const offset = (pageNum - 1) * limitNum;

      const where = { user_id: userId };
      if (is_read !== undefined) {
        where.is_read = is_read === 'true';
      }
      if (type) {
        where.type = type;
      }

      const { rows, count } = await Notification.findAndCountAll({
        where,
        limit: limitNum,
        offset,
        order: [['created_at', 'DESC']]
      });

      return res.json({
        status: 'success',
        message: 'Notifications retrieved successfully',
        data: {
          notifications: rows,
          pagination: {
            total: count,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(count / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('获取通知列表失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve notifications', error: error.message });
    }
  }
);

// 获取未读通知数量
router.get('/unread-count',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const count = await Notification.count({
        where: {
          user_id: userId,
          is_read: false
        }
      });

      return res.json({
        status: 'success',
        message: 'Unread count retrieved successfully',
        data: { count }
      });
    } catch (error) {
      console.error('获取未读通知数量失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve unread count', error: error.message });
    }
  }
);

// 获取单个通知详情
router.get('/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const { id } = req.params;
      const notification = await Notification.findOne({
        where: {
          id,
          user_id: userId
        }
      });

      if (!notification) {
        return res.status(404).json({ status: 'error', message: 'Notification not found' });
      }

      return res.json({
        status: 'success',
        message: 'Notification retrieved successfully',
        data: { notification }
      });
    } catch (error) {
      console.error('获取通知详情失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve notification', error: error.message });
    }
  }
);

// 标记单个通知为已读
router.put('/:id/read',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const { id } = req.params;
      const notification = await Notification.findOne({
        where: {
          id,
          user_id: userId
        }
      });

      if (!notification) {
        return res.status(404).json({ status: 'error', message: 'Notification not found' });
      }

      await notification.update({ is_read: true });

      return res.json({
        status: 'success',
        message: 'Notification marked as read',
        data: { notification }
      });
    } catch (error) {
      console.error('标记通知为已读失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to mark notification as read', error: error.message });
    }
  }
);

// 标记所有通知为已读
router.put('/read-all',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const [updatedCount] = await Notification.update(
        { is_read: true },
        {
          where: {
            user_id: userId,
            is_read: false
          }
        }
      );

      return res.json({
        status: 'success',
        message: 'All notifications marked as read',
        data: { updatedCount }
      });
    } catch (error) {
      console.error('标记所有通知为已读失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to mark all notifications as read', error: error.message });
    }
  }
);

// 删除单个通知
router.delete('/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const { id } = req.params;
      const notification = await Notification.findOne({
        where: {
          id,
          user_id: userId
        }
      });

      if (!notification) {
        return res.status(404).json({ status: 'error', message: 'Notification not found' });
      }

      await notification.destroy();

      return res.json({
        status: 'success',
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      console.error('删除通知失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to delete notification', error: error.message });
    }
  }
);

module.exports = router;

