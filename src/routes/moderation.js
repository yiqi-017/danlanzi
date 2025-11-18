const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Report, ModerationQueue, User, Resource, CourseReview, ReviewComment } = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function getUserIdFromReq(req) {
  return req.user && (req.user.userId || req.user.id);
}

// 根据实体类型获取实体模型
function getEntityModel(entityType) {
  switch (entityType) {
    case 'resource':
      return Resource;
    case 'review':
      return CourseReview;
    case 'comment':
      return ReviewComment;
    default:
      return null;
  }
}

// 更新或创建审核队列项
async function updateOrCreateModerationQueue(entityType, entityId, reportCount = 1) {
  const [moderationItem, created] = await ModerationQueue.findOrCreate({
    where: {
      entity_type: entityType,
      entity_id: entityId
    },
    defaults: {
      entity_type: entityType,
      entity_id: entityId,
      report_count: reportCount,
      status: 'pending'
    }
  });

  if (!created) {
    // 如果已存在，增加举报次数
    await moderationItem.update({
      report_count: moderationItem.report_count + reportCount,
      status: moderationItem.status === 'pending' ? 'pending' : moderationItem.status
    });
  }

  return moderationItem;
}

// ==================== 举报记录接口 ====================

// 创建举报（普通用户）
router.post('/reports',
  authenticateToken,
  [
    body('entity_type').isIn(['resource', 'review', 'comment']).withMessage('entity_type must be one of: resource, review, comment'),
    body('entity_id').isInt({ min: 1 }).withMessage('entity_id must be a positive integer'),
    body('reason').isIn(['plagiarism', 'abuse', 'spam', 'other']).withMessage('reason must be one of: plagiarism, abuse, spam, other'),
    body('details').optional().isString().withMessage('details must be a string')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }

      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const { entity_type, entity_id, reason, details } = req.body;

      // 验证实体是否存在
      const EntityModel = getEntityModel(entity_type);
      if (!EntityModel) {
        return res.status(400).json({ status: 'error', message: 'Invalid entity_type' });
      }

      // 只查询 id 字段，避免加载不存在的字段（如 Resource 的 tags）
      const entity = await EntityModel.findByPk(entity_id, {
        attributes: entity_type === 'resource' ? ['id'] : undefined
      });
      if (!entity) {
        return res.status(404).json({ status: 'error', message: `${entity_type} not found` });
      }

      // 检查用户是否已经举报过该实体
      const existingReport = await Report.findOne({
        where: {
          reporter_id: userId,
          entity_type,
          entity_id
        }
      });

      if (existingReport) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'You have already reported this item' 
        });
      }

      // 创建举报记录
      const report = await Report.create({
        reporter_id: userId,
        entity_type,
        entity_id,
        reason,
        details: details || null,
        status: 'pending'
      });

      // 更新或创建审核队列项
      await updateOrCreateModerationQueue(entity_type, entity_id, 1);

      return res.status(201).json({
        status: 'success',
        message: 'Report created successfully',
        data: { report }
      });
    } catch (error) {
      console.error('创建举报失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to create report', error: error.message });
    }
  }
);

// 获取举报列表（管理员）
router.get('/reports',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { page = 1, limit = 20, status, entity_type, reason, reporter_id } = req.query;
      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 20, 100);
      const offset = (pageNum - 1) * limitNum;

      const where = {};
      if (status) where.status = status;
      if (entity_type) where.entity_type = entity_type;
      if (reason) where.reason = reason;
      if (reporter_id) where.reporter_id = reporter_id;

      const { rows, count } = await Report.findAndCountAll({
        where,
        limit: limitNum,
        offset,
        order: [['created_at', 'DESC']],
        include: [{
          model: User,
          as: 'reporter',
          attributes: ['id', 'nickname', 'email', 'student_id']
        }]
      });

      return res.json({
        status: 'success',
        message: 'Reports retrieved successfully',
        data: {
          reports: rows,
          pagination: {
            total: count,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(count / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('获取举报列表失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve reports', error: error.message });
    }
  }
);

// 获取当前用户的举报列表（必须在 /reports/:id 之前）
router.get('/reports/my',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const { page = 1, limit = 20 } = req.query;
      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 20, 100);
      const offset = (pageNum - 1) * limitNum;

      const { rows, count } = await Report.findAndCountAll({
        where: { reporter_id: userId },
        limit: limitNum,
        offset,
        order: [['created_at', 'DESC']]
      });

      return res.json({
        status: 'success',
        message: 'My reports retrieved successfully',
        data: {
          reports: rows,
          pagination: {
            total: count,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(count / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('获取我的举报列表失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve my reports', error: error.message });
    }
  }
);

// 获取单个举报详情（管理员）
router.get('/reports/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const report = await Report.findByPk(id, {
        include: [{
          model: User,
          as: 'reporter',
          attributes: ['id', 'nickname', 'email', 'student_id']
        }]
      });

      if (!report) {
        return res.status(404).json({ status: 'error', message: 'Report not found' });
      }

      return res.json({
        status: 'success',
        message: 'Report retrieved successfully',
        data: { report }
      });
    } catch (error) {
      console.error('获取举报详情失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve report', error: error.message });
    }
  }
);

// 更新举报状态（管理员）
router.put('/reports/:id/status',
  authenticateToken,
  requireAdmin,
  [
    body('status').isIn(['pending', 'handled']).withMessage('status must be one of: pending, handled')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }

      const { id } = req.params;
      const { status } = req.body;

      const report = await Report.findByPk(id);
      if (!report) {
        return res.status(404).json({ status: 'error', message: 'Report not found' });
      }

      await report.update({ status });

      return res.json({
        status: 'success',
        message: 'Report status updated successfully',
        data: { report }
      });
    } catch (error) {
      console.error('更新举报状态失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to update report status', error: error.message });
    }
  }
);

// ==================== 审核队列表接口 ====================

// 获取审核队列列表（管理员）
router.get('/moderation-queue',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { page = 1, limit = 20, status, entity_type, sort_by = 'report_count', sort_order = 'DESC' } = req.query;
      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 20, 100);
      const offset = (pageNum - 1) * limitNum;

      const where = {};
      if (status) where.status = status;
      if (entity_type) where.entity_type = entity_type;

      const validSortFields = ['report_count', 'created_at', 'updated_at'];
      const sortField = validSortFields.includes(sort_by) ? sort_by : 'report_count';
      const sortDir = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const { rows, count } = await ModerationQueue.findAndCountAll({
        where,
        limit: limitNum,
        offset,
        order: [[sortField, sortDir]],
        include: [{
          model: User,
          as: 'handler',
          attributes: ['id', 'nickname', 'email'],
          required: false
        }]
      });

      return res.json({
        status: 'success',
        message: 'Moderation queue retrieved successfully',
        data: {
          items: rows,
          pagination: {
            total: count,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(count / limitNum)
          }
        }
      });
    } catch (error) {
      console.error('获取审核队列失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve moderation queue', error: error.message });
    }
  }
);

// 手动创建审核队列项（管理员）
router.post('/moderation-queue',
  authenticateToken,
  requireAdmin,
  [
    body('entity_type').isIn(['resource', 'review', 'comment']).withMessage('entity_type must be one of: resource, review, comment'),
    body('entity_id').isInt({ min: 1 }).withMessage('entity_id must be a positive integer'),
    body('notes').optional().isString().withMessage('notes must be a string')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }

      const { entity_type, entity_id, notes } = req.body;

      // 验证实体是否存在
      const EntityModel = getEntityModel(entity_type);
      if (!EntityModel) {
        return res.status(400).json({ status: 'error', message: 'Invalid entity_type' });
      }

      // 只查询 id 字段，避免加载不存在的字段（如 Resource 的 tags）
      const entity = await EntityModel.findByPk(entity_id, {
        attributes: entity_type === 'resource' ? ['id'] : undefined
      });
      if (!entity) {
        return res.status(404).json({ status: 'error', message: `${entity_type} not found` });
      }

      // 获取现有举报数量
      const reportCount = await Report.count({
        where: {
          entity_type,
          entity_id
        }
      });

      const item = await updateOrCreateModerationQueue(entity_type, entity_id, 0);
      if (notes) {
        await item.update({ notes });
      }

      return res.status(201).json({
        status: 'success',
        message: 'Moderation queue item created successfully',
        data: { item }
      });
    } catch (error) {
      console.error('创建审核队列项失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to create moderation queue item', error: error.message });
    }
  }
);

// 处理审核项（管理员，必须在 /:id 之前）
router.put('/moderation-queue/:id/handle',
  authenticateToken,
  requireAdmin,
  [
    body('status').isIn(['pending', 'approved', 'rejected', 'removed']).withMessage('status must be one of: pending, approved, rejected, removed'),
    body('notes').optional().isString().withMessage('notes must be a string')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }

      const { id } = req.params;
      const { status, notes } = req.body;
      const userId = getUserIdFromReq(req);

      const item = await ModerationQueue.findByPk(id);
      if (!item) {
        return res.status(404).json({ status: 'error', message: 'Moderation queue item not found' });
      }

      const updateData = {
        status,
        handled_by: userId,
        handled_at: new Date()
      };

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      await item.update(updateData);

      // 如果状态为 approved, rejected, 或 removed，将所有相关举报标记为已处理
      if (status !== 'pending') {
        await Report.update(
          { status: 'handled' },
          {
            where: {
              entity_type: item.entity_type,
              entity_id: item.entity_id,
              status: 'pending'
            }
          }
        );
      }

      return res.json({
        status: 'success',
        message: 'Moderation queue item handled successfully',
        data: { item }
      });
    } catch (error) {
      console.error('处理审核项失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to handle moderation queue item', error: error.message });
    }
  }
);

// 获取审核统计信息（管理员，必须在 /:id 之前）
router.get('/moderation-queue/stats',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const pendingCount = await ModerationQueue.count({ where: { status: 'pending' } });
      const approvedCount = await ModerationQueue.count({ where: { status: 'approved' } });
      const rejectedCount = await ModerationQueue.count({ where: { status: 'rejected' } });
      const removedCount = await ModerationQueue.count({ where: { status: 'removed' } });

      const pendingReportsCount = await Report.count({ where: { status: 'pending' } });
      const handledReportsCount = await Report.count({ where: { status: 'handled' } });

      return res.json({
        status: 'success',
        message: 'Moderation statistics retrieved successfully',
        data: {
          moderation_queue: {
            pending: pendingCount,
            approved: approvedCount,
            rejected: rejectedCount,
            removed: removedCount,
            total: pendingCount + approvedCount + rejectedCount + removedCount
          },
          reports: {
            pending: pendingReportsCount,
            handled: handledReportsCount,
            total: pendingReportsCount + handledReportsCount
          }
        }
      });
    } catch (error) {
      console.error('获取审核统计信息失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve moderation statistics', error: error.message });
    }
  }
);

// 获取单个审核项详情（管理员）
router.get('/moderation-queue/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const item = await ModerationQueue.findByPk(id, {
        include: [
          {
            model: User,
            as: 'handler',
            attributes: ['id', 'nickname', 'email'],
            required: false
          }
        ]
      });

      if (!item) {
        return res.status(404).json({ status: 'error', message: 'Moderation queue item not found' });
      }

      // 获取相关的举报记录
      const reports = await Report.findAll({
        where: {
          entity_type: item.entity_type,
          entity_id: item.entity_id
        },
        include: [{
          model: User,
          as: 'reporter',
          attributes: ['id', 'nickname', 'email', 'student_id']
        }],
        order: [['created_at', 'DESC']]
      });

      return res.json({
        status: 'success',
        message: 'Moderation queue item retrieved successfully',
        data: {
          item,
          reports
        }
      });
    } catch (error) {
      console.error('获取审核项详情失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve moderation queue item', error: error.message });
    }
  }
);

module.exports = router;

