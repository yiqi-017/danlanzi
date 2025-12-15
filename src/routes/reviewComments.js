const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  ReviewComment,
  ReviewCommentReaction,
  ReviewCommentStat,
  CourseReview,
  User
} = require('../models');
const { authenticateToken, optionalAuthenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');

const router = express.Router();

function getUserIdFromReq(req) {
  return req.user && (req.user.userId || req.user.id);
}

async function ensureCommentStatExists(commentId) {
  let stat = await ReviewCommentStat.findByPk(commentId);
  if (!stat) {
    stat = await ReviewCommentStat.create({
      comment_id: commentId,
      like_count: 0,
      dislike_count: 0,
      net_score: 0,
      last_reacted_at: null
    });
  }
  return stat;
}

// 列表（按 review_id）
router.get('/', optionalAuthenticateToken, async (req, res) => {
  try {
    const { review_id, page = 1, limit = 20 } = req.query;
    if (!review_id) {
      return res.status(400).json({ status: 'error', message: 'review_id is required' });
    }
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const { rows, count } = await ReviewComment.findAndCountAll({
      where: { review_id },
      limit: limitNum,
      offset,
      order: [['created_at', 'ASC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_path', 'role'] },
        { model: CourseReview, as: 'review', attributes: ['id', 'course_id', 'offering_id'] },
        { model: ReviewCommentStat, as: 'stats' }
      ]
    });

    // 如果用户已登录，检查每个评论的用户反应状态
    let userReactions = new Map();
    if (req.user && req.user.userId) {
      const commentIds = rows.map(c => c.id);
      if (commentIds.length > 0) {
        const reactions = await ReviewCommentReaction.findAll({
          where: {
            user_id: req.user.userId,
            comment_id: { [Op.in]: commentIds }
          },
          attributes: ['comment_id', 'reaction']
        });
        reactions.forEach(r => {
          userReactions.set(r.comment_id, r.reaction);
        });
      }
    }

    // 为每个评论添加用户反应状态
    const commentsWithReactions = rows.map(comment => {
      const commentJson = comment.toJSON();
      const userReaction = userReactions.get(comment.id);
      commentJson.userReaction = userReaction || null;
      // 确保stats存在
      if (!commentJson.stats) {
        commentJson.stats = {
          like_count: 0,
          dislike_count: 0,
          net_score: 0
        };
      }
      return commentJson;
    });

    return res.json({
      status: 'success',
      message: 'Comments retrieved successfully',
      data: {
        comments: commentsWithReactions,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('获取评价评论列表失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve comments', error: error.message });
  }
});

// 详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await ReviewComment.findByPk(id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'nickname', 'avatar_path', 'role'] },
        { model: CourseReview, as: 'review', attributes: ['id', 'course_id', 'offering_id'] },
        { model: ReviewCommentStat, as: 'stats' }
      ]
    });
    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }
    return res.json({ status: 'success', message: 'Comment retrieved successfully', data: { comment } });
  } catch (error) {
    console.error('获取评价评论失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve comment', error: error.message });
  }
});

// 创建
router.post('/',
  authenticateToken,
  [
    body('review_id').isInt().withMessage('review_id is required'),
    body('content').isString().isLength({ min: 1 }).withMessage('content is required')
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
      const { review_id, content } = req.body;

      const review = await CourseReview.findByPk(review_id);
      if (!review) {
        return res.status(404).json({ status: 'error', message: 'Review not found' });
      }

      const comment = await ReviewComment.create({
        review_id,
        user_id: userId,
        content,
        status: 'normal'
      });

      await ensureCommentStatExists(comment.id);

      return res.status(201).json({ status: 'success', message: 'Comment created successfully', data: { comment } });
    } catch (error) {
      console.error('创建评价评论失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to create comment', error: error.message });
    }
  }
);

// 更新评论（作者本人或管理员）
router.put('/:id',
  authenticateToken,
  [
    body('content').optional().isString().isLength({ min: 1 }).withMessage('content must be non-empty string'),
    body('status').optional().isIn(['normal','blocked','deleted'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }
      const { id } = req.params;
      const comment = await ReviewComment.findByPk(id);
      if (!comment) {
        return res.status(404).json({ status: 'error', message: 'Comment not found' });
      }
      const userId = getUserIdFromReq(req);
      const isAdmin = req.user.role === 'admin';
      if (!isAdmin && comment.user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Permission denied' });
      }

      const update = {};
      if (req.body.content !== undefined) update.content = req.body.content;
      if (req.body.status !== undefined) update.status = req.body.status;

      await comment.update(update);
      return res.json({ status: 'success', message: 'Comment updated successfully', data: { comment } });
    } catch (error) {
      console.error('更新评价评论失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to update comment', error: error.message });
    }
  }
);

// 删除（作者本人或管理员）
router.delete('/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const comment = await ReviewComment.findByPk(id);
      if (!comment) {
        return res.status(404).json({ status: 'error', message: 'Comment not found' });
      }
      const userId = getUserIdFromReq(req);
      const isAdmin = req.user.role === 'admin';
      if (!isAdmin && comment.user_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Permission denied' });
      }
      await comment.destroy();
      return res.json({ status: 'success', message: 'Comment deleted successfully' });
    } catch (error) {
      console.error('删除评价评论失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to delete comment', error: error.message });
    }
  }
);

// 点赞/点踩
router.post('/:id/reactions',
  authenticateToken,
  [ body('reaction').isIn(['like','dislike']).withMessage('reaction must be like or dislike') ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }
      const { id } = req.params;
      const commentId = parseInt(id);
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }
      const incoming = req.body.reaction;

      const comment = await ReviewComment.findByPk(commentId);
      if (!comment) {
        return res.status(404).json({ status: 'error', message: 'Comment not found' });
      }

      let existing = await ReviewCommentReaction.findOne({ where: { user_id: userId, comment_id: commentId } });
      let stat = await ensureCommentStatExists(commentId);
      const now = new Date();

      if (!existing) {
        await ReviewCommentReaction.create({ user_id: userId, comment_id: commentId, reaction: incoming });
        if (incoming === 'like') stat.like_count += 1; else stat.dislike_count += 1;
        stat.net_score = stat.like_count - stat.dislike_count;
        stat.last_reacted_at = now;
        await stat.save();
        return res.status(201).json({ status: 'success', message: 'Reaction added', data: { reaction: incoming, stats: stat } });
      }

      if (existing.reaction === incoming) {
        await existing.destroy();
        if (incoming === 'like') stat.like_count = Math.max(0, stat.like_count - 1);
        else stat.dislike_count = Math.max(0, stat.dislike_count - 1);
        stat.net_score = stat.like_count - stat.dislike_count;
        stat.last_reacted_at = now;
        await stat.save();
        return res.json({ status: 'success', message: 'Reaction removed', data: { reaction: null, stats: stat } });
      } else {
        const prev = existing.reaction;
        await existing.update({ reaction: incoming });
        if (prev === 'like') stat.like_count = Math.max(0, stat.like_count - 1);
        if (prev === 'dislike') stat.dislike_count = Math.max(0, stat.dislike_count - 1);
        if (incoming === 'like') stat.like_count += 1;
        if (incoming === 'dislike') stat.dislike_count += 1;
        stat.net_score = stat.like_count - stat.dislike_count;
        stat.last_reacted_at = now;
        await stat.save();
        return res.json({ status: 'success', message: 'Reaction updated', data: { reaction: incoming, stats: stat } });
      }
    } catch (error) {
      console.error('评论点赞/点踩失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to react comment', error: error.message });
    }
  }
);

// 获取统计
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const commentId = parseInt(id);
    const comment = await ReviewComment.findByPk(commentId);
    if (!comment) {
      return res.status(404).json({ status: 'error', message: 'Comment not found' });
    }
    const stat = await ensureCommentStatExists(commentId);
    return res.json({ status: 'success', message: 'Stats retrieved successfully', data: { stats: stat } });
  } catch (error) {
    console.error('获取评论统计失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve stats', error: error.message });
  }
});

module.exports = router;


