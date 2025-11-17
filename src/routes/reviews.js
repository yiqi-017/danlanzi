const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const {
  CourseReview,
  ReviewReaction,
  ReviewStat,
  User
} = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function getUserIdFromReq(req) {
  return req.user && (req.user.userId || req.user.id);
}

async function ensureReviewStatExists(reviewId) {
  let stat = await ReviewStat.findByPk(reviewId);
  if (!stat) {
    stat = await ReviewStat.create({
      review_id: reviewId,
      like_count: 0,
      dislike_count: 0,
      net_score: 0,
      last_reacted_at: null
    });
  }
  return stat;
}

// 列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, course_id, offering_id, author_id, status, search } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const where = {};
    if (course_id) where.course_id = course_id;
    if (offering_id) where.offering_id = offering_id;
    if (author_id) where.author_id = author_id;
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { content: { [Op.like]: `%${search}%` } }
      ];
    }

    const { rows, count } = await CourseReview.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [['created_at', 'DESC']],
      include: [
        { model: User, as: 'author', attributes: ['id', 'nickname', 'avatar_path', 'role'] },
        { model: ReviewStat, as: 'stats' }
      ]
    });

    return res.json({
      status: 'success',
      message: 'Reviews retrieved successfully',
      data: {
        reviews: rows,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('获取课程评价列表失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve reviews', error: error.message });
  }
});

// 详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const review = await CourseReview.findByPk(id, {
      include: [
        { model: User, as: 'author', attributes: ['id', 'nickname', 'avatar_path', 'role'] },
        { model: ReviewStat, as: 'stats' }
      ]
    });
    if (!review) {
      return res.status(404).json({ status: 'error', message: 'Review not found' });
    }
    return res.json({
      status: 'success',
      message: 'Review retrieved successfully',
      data: { review }
    });
  } catch (error) {
    console.error('获取课程评价失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve review', error: error.message });
  }
});

// 创建
router.post('/',
  authenticateToken,
  [
    body('course_id').isInt().withMessage('course_id is required'),
    body('offering_id').optional().isInt(),
    body('rating_overall').optional().isInt({ min: 1, max: 5 }),
    body('rating_difficulty').optional().isInt({ min: 1, max: 5 }),
    body('rating_workload').optional().isInt({ min: 1, max: 5 }),
    body('rating_teaching').optional().isInt({ min: 1, max: 5 }),
    body('title').optional().isString(),
    body('content').optional().isString(),
    body('is_anonymous').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }
      const authorId = getUserIdFromReq(req);
      if (!authorId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }

      const {
        course_id,
        offering_id,
        rating_overall,
        rating_difficulty,
        rating_workload,
        rating_teaching,
        title,
        content,
        is_anonymous
      } = req.body;

      const review = await CourseReview.create({
        author_id: authorId,
        course_id,
        offering_id,
        rating_overall,
        rating_difficulty,
        rating_workload,
        rating_teaching,
        title,
        content,
        is_anonymous: !!is_anonymous,
        status: 'normal'
      });

      await ensureReviewStatExists(review.id);

      return res.status(201).json({
        status: 'success',
        message: 'Review created successfully',
        data: { review }
      });
    } catch (error) {
      console.error('创建课程评价失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to create review', error: error.message });
    }
  }
);

// 更新（作者本人或管理员）
router.put('/:id',
  authenticateToken,
  [
    body('rating_overall').optional().isInt({ min: 1, max: 5 }),
    body('rating_difficulty').optional().isInt({ min: 1, max: 5 }),
    body('rating_workload').optional().isInt({ min: 1, max: 5 }),
    body('rating_teaching').optional().isInt({ min: 1, max: 5 }),
    body('title').optional().isString(),
    body('content').optional().isString(),
    body('is_anonymous').optional().isBoolean(),
    body('status').optional().isIn(['normal','blocked','deleted'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
      }
      const { id } = req.params;
      const review = await CourseReview.findByPk(id);
      if (!review) {
        return res.status(404).json({ status: 'error', message: 'Review not found' });
      }
      const userId = getUserIdFromReq(req);
      const isAdmin = req.user.role === 'admin';
      if (!isAdmin && review.author_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Permission denied' });
      }

      const update = {};
      [
        'rating_overall','rating_difficulty','rating_workload','rating_teaching',
        'title','content','is_anonymous','status'
      ].forEach(k => {
        if (req.body[k] !== undefined) update[k] = req.body[k];
      });

      await review.update(update);
      return res.json({ status: 'success', message: 'Review updated successfully', data: { review } });
    } catch (error) {
      console.error('更新课程评价失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to update review', error: error.message });
    }
  }
);

// 删除（作者本人或管理员）
router.delete('/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const review = await CourseReview.findByPk(id);
      if (!review) {
        return res.status(404).json({ status: 'error', message: 'Review not found' });
      }
      const userId = getUserIdFromReq(req);
      const isAdmin = req.user.role === 'admin';
      if (!isAdmin && review.author_id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Permission denied' });
      }
      await review.destroy();
      return res.json({ status: 'success', message: 'Review deleted successfully' });
    } catch (error) {
      console.error('删除课程评价失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to delete review', error: error.message });
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
      const reviewId = parseInt(id);
      const userId = getUserIdFromReq(req);
      if (!userId) {
        return res.status(401).json({ status: 'error', message: 'Invalid token payload: user id missing' });
      }
      const incoming = req.body.reaction;

      const review = await CourseReview.findByPk(reviewId);
      if (!review) {
        return res.status(404).json({ status: 'error', message: 'Review not found' });
      }

      let existing = await ReviewReaction.findOne({ where: { user_id: userId, review_id: reviewId } });
      let stat = await ensureReviewStatExists(reviewId);
      const now = new Date();

      if (!existing) {
        await ReviewReaction.create({ user_id: userId, review_id: reviewId, reaction: incoming });
        if (incoming === 'like') {
          stat.like_count += 1;
        } else {
          stat.dislike_count += 1;
        }
        stat.net_score = stat.like_count - stat.dislike_count;
        stat.last_reacted_at = now;
        await stat.save();
        return res.status(201).json({ status: 'success', message: 'Reaction added', data: { reaction: incoming, stats: stat } });
      }

      if (existing.reaction === incoming) {
        // toggle off
        await existing.destroy();
        if (incoming === 'like') {
          stat.like_count = Math.max(0, stat.like_count - 1);
        } else {
          stat.dislike_count = Math.max(0, stat.dislike_count - 1);
        }
        stat.net_score = stat.like_count - stat.dislike_count;
        stat.last_reacted_at = now;
        await stat.save();
        return res.json({ status: 'success', message: 'Reaction removed', data: { reaction: null, stats: stat } });
      } else {
        // switch reaction
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
      console.error('评价点赞/点踩失败:', error);
      return res.status(500).json({ status: 'error', message: 'Failed to react review', error: error.message });
    }
  }
);

// 获取统计
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const reviewId = parseInt(id);
    const review = await CourseReview.findByPk(reviewId);
    if (!review) {
      return res.status(404).json({ status: 'error', message: 'Review not found' });
    }
    const stat = await ensureReviewStatExists(reviewId);
    return res.json({ status: 'success', message: 'Stats retrieved successfully', data: { stats: stat } });
  } catch (error) {
    console.error('获取评价统计失败:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve stats', error: error.message });
  }
});

module.exports = router;


