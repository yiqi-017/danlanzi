const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { 
  Report, 
  ModerationQueue, 
  User, 
  Resource, 
  CourseReview, 
  ReviewComment, 
  ResourceComment,
  ResourceCourseLink,
  ResourceStat,
  ReviewStat,
  ReviewCommentStat,
  ResourceCommentStat,
  Course,
  CourseOffering
} = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { createNotification, createNotifications } = require('../utils/notificationHelper');

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
    case 'review_comment':
      return ReviewComment;
    case 'resource_comment':
      return ResourceComment;
    default:
      return null;
  }
}

// 更新或创建审核队列项
async function updateOrCreateModerationQueue(entityType, entityId, reportCount = 1) {
  try {
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
      const currentStatus = moderationItem.status;
      let newStatus = currentStatus;
      
      // 如果是removed（已删除）且是真正的举报行为（reportCount > 0）
      // 这种情况不应该发生，因为在创建举报前已经做了检查
      if (currentStatus === 'removed' && reportCount > 0) {
        console.warn(`尝试举报已删除的内容: entity_type=${entityType}, entity_id=${entityId}`);
        throw new Error('Cannot report removed content');
      }
      
      // 如果之前的状态是已审核（approved、rejected），将状态改为pending_review（待重新审核）
      if (currentStatus === 'approved' || currentStatus === 'rejected') {
        newStatus = 'pending_review';
      }
      // 如果是pending或pending_review，保持不变
      else if (currentStatus === 'pending' || currentStatus === 'pending_review') {
        newStatus = currentStatus;
      }
      // 如果是removed，保持removed状态（用于非举报场景，如手动创建审核队列项）
      else if (currentStatus === 'removed') {
        newStatus = 'removed';
      }
      
      console.log(`更新审核队列项: ID=${moderationItem.id}, 当前状态=${currentStatus}, 新状态=${newStatus}, 举报次数=${moderationItem.report_count} -> ${moderationItem.report_count + reportCount}`);
      
      await moderationItem.update({
        report_count: moderationItem.report_count + reportCount,
        status: newStatus
      });
    } else {
      console.log(`创建新的审核队列项: entity_type=${entityType}, entity_id=${entityId}, report_count=${reportCount}`);
    }

    return moderationItem;
  } catch (error) {
    console.error('更新或创建审核队列项失败:', error);
    console.error('参数:', { entityType, entityId, reportCount });
    throw error;
  }
}

// ==================== 举报记录接口 ====================

// 创建举报（普通用户）
router.post('/reports',
  authenticateToken,
  [
    body('entity_type').isIn(['resource', 'review', 'resource_comment', 'review_comment']).withMessage('entity_type must be one of: resource, review, resource_comment, review_comment'),
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
      let entity = null;
      if (entity_type === 'resource') {
        entity = await Resource.findByPk(entity_id, {
          attributes: ['id', 'status']
        });
      } else if (entity_type === 'review') {
        entity = await CourseReview.findByPk(entity_id, {
          attributes: ['id', 'status']
        });
      } else if (entity_type === 'review_comment') {
        // 课评评论
        entity = await ReviewComment.findByPk(entity_id, {
          attributes: ['id', 'status']
        });
      } else if (entity_type === 'resource_comment') {
        // 资源评论
          entity = await ResourceComment.findByPk(entity_id, {
            attributes: ['id', 'status']
          });
      } else {
        return res.status(400).json({ status: 'error', message: 'Invalid entity_type' });
      }
      
      if (!entity) {
        return res.status(404).json({ status: 'error', message: `${entity_type} not found` });
      }

      // 检查实体是否已被删除
      // 注意：只检查 status 明确为 'deleted' 的情况
      if (entity.status && entity.status === 'deleted') {
        console.log(`尝试举报已删除的内容: entity_type=${entity_type}, entity_id=${entity_id}, status=${entity.status}`);
        return res.status(400).json({ 
          status: 'error', 
          message: 'Cannot report deleted content' 
        });
      }

      // 检查审核队列项状态,如果内容已被标记为删除,不允许再次举报
      const existingModerationItem = await ModerationQueue.findOne({
        where: {
          entity_type,
          entity_id
        }
      });

      if (existingModerationItem && existingModerationItem.status === 'removed') {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Cannot report removed content' 
        });
      }

      // 检查用户是否已经有待处理的举报
      // 但是，如果审核队列中没有这个资源，说明之前的举报可能已经被处理或删除
      // 在这种情况下，允许再次举报
      const existingReport = await Report.findOne({
        where: {
          reporter_id: userId,
          entity_type,
          entity_id,
          status: 'pending' // 只检查待处理的举报
        }
      });

      if (existingReport) {
        // 如果审核队列中存在这个资源，说明确实在审核中，不允许重复举报
        if (existingModerationItem) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'You have already reported this item and it is pending review' 
        });
        }
        // 如果审核队列中不存在，说明之前的举报可能已经被处理或删除
        // 将旧的pending举报标记为handled，允许创建新的举报
        await existingReport.update({ status: 'handled' });
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

      console.log('举报记录创建成功:', report.id);

      // 更新或创建审核队列项
      console.log('准备更新审核队列:', { entity_type, entity_id });
      await updateOrCreateModerationQueue(entity_type, entity_id, 1);
      console.log('审核队列更新成功');

      // 给举报者发送通知
      const entityTypeName = entity_type === 'resource' ? '资源'
        : entity_type === 'review' ? '课评'
        : entity_type === 'resource_comment' ? '资源评论'
        : '课评回复';
      
      await createNotification({
        user_id: userId,
        type: 'system',
        title: '举报已提交',
        content: `你举报的${entityTypeName}已提交，我们会尽快处理`,
        entity_type,
        entity_id
      });

      return res.status(201).json({
        status: 'success',
        message: 'Report created successfully',
        data: { report }
      });
    } catch (error) {
      console.error('创建举报失败:', error);
      console.error('错误堆栈:', error.stack);
      return res.status(500).json({ 
        status: 'error', 
        message: 'Failed to create report', 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
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

// 删除举报记录（管理员）
router.delete('/reports/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const report = await Report.findByPk(id);
      if (!report) {
        return res.status(404).json({ status: 'error', message: 'Report not found' });
      }

      // 只能删除已处理的举报
      if (report.status !== 'handled') {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Cannot delete pending reports. Only handled reports can be deleted.' 
        });
      }

      await report.destroy();

      return res.json({
        status: 'success',
        message: 'Report deleted successfully'
      });
    } catch (error) {
      console.error('删除举报记录失败:', error);
      return res.status(500).json({ 
        status: 'error', 
        message: 'Failed to delete report', 
        error: error.message 
      });
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
    body('entity_type').isIn(['resource', 'review', 'resource_comment', 'review_comment']).withMessage('entity_type must be one of: resource, review, resource_comment, review_comment'),
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
    body('status').isIn(['pending', 'approved', 'rejected', 'removed', 'pending_review']).withMessage('status must be one of: pending, approved, rejected, removed, pending_review'),
    body('action').optional().isIn(['hide']).withMessage('action must be "hide" for resources'),
    body('notes').optional().isString().withMessage('notes must be a string')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }

      const { id } = req.params;
      const { status, action, notes } = req.body;
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

      // 根据处理结果更新实体状态
      let entity = null;
      const EntityModel = getEntityModel(item.entity_type);
      if (EntityModel) {
        entity = await EntityModel.findByPk(item.entity_id);
        if (entity) {
          if (status === 'removed') {
            // 删除：设置实体状态为 deleted
              await entity.update({ status: 'deleted' });
          } else if (status === 'approved') {
            if (item.entity_type === 'resource') {
              if (action === 'hide') {
                // 隐藏资源
                await entity.update({ status: 'hidden' });
              } else {
                // 不违规：如果之前是 hidden，需要恢复为 normal
                if (entity.status === 'hidden') {
                  await entity.update({ status: 'normal' });
                }
              }
            }
          }
        }
      }

      // 如果状态为 approved, rejected, removed，将所有相关举报标记为已处理
      if (status !== 'pending' && status !== 'pending_review') {
        // 获取所有相关举报
        const reports = await Report.findAll({
          where: {
            entity_type: item.entity_type,
            entity_id: item.entity_id,
            status: 'pending'
          }
        });

        // 标记举报为已处理
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

        // 通知所有举报者
        const reporterIds = [...new Set(reports.map(r => r.reporter_id))];
        if (reporterIds.length > 0) {
          const notifications = reporterIds.map(reporterId => ({
            user_id: reporterId,
            type: 'system',
            title: '你的举报已处理',
            content: status === 'removed' 
              ? '你举报的内容已被删除'
              : status === 'approved' && action === 'hide'
              ? '你举报的内容已被隐藏'
              : '你举报的内容已处理',
            entity_type: item.entity_type,
            entity_id: item.entity_id
          }));
          await createNotifications(notifications);
        }

        // 通知内容创建者（如果内容被删除或隐藏）
        if (status === 'removed' || (status === 'approved' && action === 'hide')) {
          let contentOwnerId = null;
          if (item.entity_type === 'resource' && entity) {
            contentOwnerId = entity.uploader_id;
          } else if (item.entity_type === 'review' && entity) {
            contentOwnerId = entity.author_id;
          } else if ((item.entity_type === 'resource_comment' || item.entity_type === 'review_comment') && entity) {
            contentOwnerId = entity.user_id;
          }

          if (contentOwnerId) {
            const entityTypeName = item.entity_type === 'resource' ? '资源'
              : item.entity_type === 'review' ? '课评'
              : item.entity_type === 'resource_comment' ? '资源评论'
              : '课评评论';
            
            await createNotification({
              user_id: contentOwnerId,
              type: item.entity_type === 'resource' ? 'resource'
                : item.entity_type === 'review' ? 'review'
                : 'comment',
              title: status === 'removed' ? `你的${entityTypeName}已被删除` : `你的${entityTypeName}已被隐藏`,
              content: status === 'removed' 
                ? `你的${entityTypeName}因被举报违规已被删除`
                : `你的${entityTypeName}因被举报违规已被隐藏`,
              entity_type: item.entity_type,
              entity_id: item.entity_id
            });
          }
        }
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

// 删除审核队列项（管理员）
router.delete('/moderation-queue/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const item = await ModerationQueue.findByPk(id);
      if (!item) {
        return res.status(404).json({ status: 'error', message: 'Moderation queue item not found' });
      }

      // 先将所有关联的待处理举报记录标记为已处理
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

      console.log(`删除审核队列项 #${id}, entity_type=${item.entity_type}, entity_id=${item.entity_id}`);

      // 删除该审核队列项
      await item.destroy();

      return res.json({
        status: 'success',
        message: 'Moderation queue item deleted successfully'
      });
    } catch (error) {
      console.error('删除审核队列项失败:', error);
      return res.status(500).json({ 
        status: 'error', 
        message: 'Failed to delete moderation queue item', 
        error: error.message 
      });
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
      const pendingReviewCount = await ModerationQueue.count({ where: { status: 'pending_review' } });
      const approvedCount = await ModerationQueue.count({ where: { status: 'approved' } });
      const rejectedCount = await ModerationQueue.count({ where: { status: 'rejected' } });
      const removedCount = await ModerationQueue.count({ where: { status: 'removed' } });

      const pendingReportsCount = await Report.count({ where: { status: 'pending' } });
      const handledReportsCount = await Report.count({ where: { status: 'handled' } });

      return res.json({
        status: 'success',
        message: 'Moderation statistics retrieved successfully',
        data: {
          stats: {
            queue: {
            pending: pendingCount,
              pending_review: pendingReviewCount,
            approved: approvedCount,
            rejected: rejectedCount,
              removed: removedCount
          },
          reports: {
            pending: pendingReportsCount,
            handled: handledReportsCount,
            total: pendingReportsCount + handledReportsCount
            }
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

      // 获取被举报的实体数据
      let entity = null;
      const EntityModel = getEntityModel(item.entity_type);
      if (EntityModel) {
        if (item.entity_type === 'resource') {
          // 对于资源，需要包含关联数据
          entity = await Resource.findByPk(item.entity_id, {
            include: [
              {
                model: User,
                as: 'uploader',
                attributes: ['id', 'nickname', 'avatar_path'],
                required: false
              },
              {
                model: ResourceCourseLink,
                as: 'courseLinks',
                required: false,
                include: [
                  {
                    model: CourseOffering,
                    as: 'offering',
                    required: false,
                    include: [
                      {
                        model: Course,
                        as: 'course',
                        required: false
                      }
                    ]
                  }
                ]
              },
              {
                model: ResourceStat,
                as: 'stats',
                required: false
              }
            ]
          });
        } else if (item.entity_type === 'review') {
          // 对于课评，需要包含关联数据
          entity = await CourseReview.findByPk(item.entity_id, {
            include: [
              {
                model: User,
                as: 'author',
                attributes: ['id', 'nickname', 'avatar_path'],
                required: false
              },
              {
                model: Course,
                as: 'course',
                required: false
              },
              {
                model: CourseOffering,
                as: 'offering',
                required: false,
                include: [
                  {
                    model: Course,
                    as: 'course',
                    required: false
                  }
                ]
              },
              {
                model: ReviewStat,
                as: 'stats',
                required: false
              }
            ]
          });
        } else if (item.entity_type === 'review_comment') {
          // 课评评论
              entity = await ReviewComment.findByPk(item.entity_id, {
                include: [
                  {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'nickname', 'avatar_path'],
                    required: false
                  },
                  {
                    model: CourseReview,
                    as: 'review',
                    required: false,
                    include: [
                      {
                        model: User,
                        as: 'author',
                        attributes: ['id', 'nickname', 'avatar_path'],
                        required: false
                      },
                      {
                        model: Course,
                        as: 'course',
                        required: false
                      },
                      {
                        model: CourseOffering,
                        as: 'offering',
                        required: false,
                        include: [
                          {
                            model: Course,
                            as: 'course',
                            required: false
                          }
                        ]
                      }
                    ]
                  },
                  {
                    model: ReviewCommentStat,
                    as: 'stats',
                    required: false
                  }
                ]
              });
          
          // 计算楼层号
          if (entity) {
            const floorNumber = await ReviewComment.count({
              where: {
                review_id: entity.review_id,
                created_at: { [Op.lte]: entity.created_at },
                status: { [Op.ne]: 'deleted' }
              }
            });
            entity = entity.toJSON();
            entity.floor_number = floorNumber;
          }
        } else if (item.entity_type === 'resource_comment') {
          // 资源评论
                entity = await ResourceComment.findByPk(item.entity_id, {
                  include: [
                    {
                      model: User,
                      as: 'user',
                      attributes: ['id', 'nickname', 'avatar_path'],
                      required: false
                    },
                    {
                      model: Resource,
                      as: 'resource',
                      required: false,
                      include: [
                        {
                          model: User,
                          as: 'uploader',
                          attributes: ['id', 'nickname', 'avatar_path'],
                          required: false
                        },
                        {
                          model: ResourceCourseLink,
                          as: 'courseLinks',
                          required: false,
                          include: [
                            {
                              model: CourseOffering,
                              as: 'offering',
                              required: false,
                              include: [
                                {
                                  model: Course,
                                  as: 'course',
                                  required: false
                                }
                              ]
                            }
                          ]
                        },
                        {
                          model: ResourceStat,
                          as: 'stats',
                          required: false
                        }
                      ]
                    },
                    {
                      model: ResourceCommentStat,
                      as: 'stats',
                      required: false
                    }
                  ]
                });
          
          // 计算楼层号
          if (entity) {
            const floorNumber = await ResourceComment.count({
              where: {
                resource_id: entity.resource_id,
                created_at: { [Op.lte]: entity.created_at },
                status: { [Op.ne]: 'deleted' }
              }
            });
            entity = entity.toJSON();
            entity.floor_number = floorNumber;
          }
        } else {
          // 其他类型，直接查询
          entity = await EntityModel.findByPk(item.entity_id);
        }
      }

      return res.json({
        status: 'success',
        message: 'Moderation queue item retrieved successfully',
        data: {
          item,
          reports,
          entity
        }
      });
    } catch (error) {
      console.error('获取审核项详情失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to retrieve moderation queue item', error: error.message });
    }
  }
);

module.exports = router;
module.exports.updateOrCreateModerationQueue = updateOrCreateModerationQueue;

