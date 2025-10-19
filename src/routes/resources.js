const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Resource, ResourceCourseLink, ResourceStat, ResourceFavorite } = require('../models');

const router = express.Router();

// 用户资源根目录（绝对路径）: dlz-database/user
const USER_BASE_DIR = path.join(__dirname, '../../../dlz-database/user');
// 资源子目录名
const RESOURCES_SUB_DIR = 'resources';

// 确保存储目录存在
if (!fs.existsSync(USER_BASE_DIR)) {
  fs.mkdirSync(USER_BASE_DIR, { recursive: true });
}

// 配置 multer（允许多种类型，必要时在 fileFilter 限制）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req?.user?.userId;
    if (!userId) {
      return cb(new Error('缺少用户身份，无法确定资源存储目录'));
    }
    const userResourcesDir = path.join(USER_BASE_DIR, String(userId), RESOURCES_SUB_DIR);
    if (!fs.existsSync(userResourcesDir)) {
      try {
        fs.mkdirSync(userResourcesDir, { recursive: true });
      } catch (e) {
        return cb(new Error('创建用户资源目录失败'));
      }
    }
    cb(null, userResourcesDir);
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safeBase = (file.originalname || 'file').replace(/[\\/:*?"<>|]/g, '_');
    const ext = path.extname(safeBase) || '';
    cb(null, `res_${ts}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// JWT 验证中间件（与 userProfile.js 保持一致风格）
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Access token required'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key', (err, user) => {
    if (err) {
      return res.status(403).json({
        status: 'error',
        message: 'Invalid or expired token'
      });
    }
    req.user = user; // 包含 userId, email, role
    next();
  });
};

// 发布资源（支持 multipart/form-data，文件字段名：file）
router.post('/', authenticateToken, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ status: 'error', message: '文件大小不能超过 20MB' });
      }
      return res.status(400).json({ status: 'error', message: '文件上传失败: ' + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const {
      type,
      title,
      description = '',
      url_or_path = '',
      visibility = 'public',
      course_id = null,
      offering_id = null
    } = req.body || {};

    // 基本校验
    const allowedTypes = ['file', 'link', 'note'];
    const allowedVisibility = ['public', 'course', 'private'];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ status: 'error', message: 'type 必须是 file/link/note' });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ status: 'error', message: 'title 必填' });
    }
    if (!allowedVisibility.includes(visibility)) {
      return res.status(400).json({ status: 'error', message: 'visibility 必须是 public/course/private' });
    }

    // 处理 url_or_path：file 类型来自上传，其余来自请求体
    let finalUrlOrPath = '';
    if (type === 'file') {
      if (!req.file) {
        return res.status(400).json({ status: 'error', message: '请通过字段名 file 上传文件' });
      }
      // 存储相对路径，如 user/7/resources/res_1710000000000.txt
      finalUrlOrPath = path.join('user', String(req.user.userId), RESOURCES_SUB_DIR, req.file.filename).replace(/\\/g, '/');
    } else if (type === 'link') {
      const input = (url_or_path || '').trim();
      if (!input) {
        return res.status(400).json({ status: 'error', message: 'link 类型需要提供 url_or_path' });
      }
      finalUrlOrPath = input;
    } else {
      // note 类型：不强制 url_or_path
      finalUrlOrPath = (url_or_path || '').trim();
    }

    // 创建资源
    const resource = await Resource.create({
      uploader_id: req.user.userId,
      type,
      title: title.trim(),
      description,
      url_or_path: finalUrlOrPath,
      visibility,
      status: 'normal'
    });

    // 可选：建立课程/开课实例关联
    if (course_id || offering_id) {
      await ResourceCourseLink.create({
        resource_id: resource.id,
        course_id: course_id || null,
        offering_id: offering_id || null
      });
    }

    // 初始化资源统计信息（最后互动时间设为上传时间）
    try {
      await ResourceStat.create({ resource_id: resource.id, last_interacted_at: new Date() });
    } catch (statErr) {
      console.error('Create resource stat failed:', statErr);
      // 不阻断资源创建流程
    }

    return res.status(201).json({
      status: 'success',
      message: 'Resource created successfully',
      data: resource
    });
  } catch (error) {
    console.error('Create resource failed:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to create resource',
      error: error.message
    });
  }
});

// 收藏资源
router.post('/:id/favorite', authenticateToken, async (req, res) => {
  try {
    const resourceId = Number(req.params.id);
    if (!resourceId || Number.isNaN(resourceId)) {
      return res.status(400).json({ status: 'error', message: '无效的资源ID' });
    }

    // 检查资源是否存在
    const resource = await Resource.findByPk(resourceId);
    if (!resource) {
      return res.status(404).json({ status: 'error', message: '资源不存在' });
    }

    // 创建收藏（若已存在则忽略）
    await ResourceFavorite.findOrCreate({
      where: { user_id: req.user.userId, resource_id: resourceId },
      defaults: { user_id: req.user.userId, resource_id: resourceId }
    });

    // 递增收藏数
    const [affected] = await ResourceStat.increment(
      { favorite_count: 1 },
      { where: { resource_id: resourceId } }
    );

    // 如果统计不存在（理论上会在创建资源时初始化），则创建一条
    if (!affected || (Array.isArray(affected) && affected[0] === 0)) {
      await ResourceStat.create({ resource_id: resourceId, favorite_count: 1 });
    }

    return res.status(200).json({ status: 'success', message: '收藏成功' });
  } catch (error) {
    console.error('Favorite resource failed:', error);
    return res.status(500).json({ status: 'error', message: '收藏失败', error: error.message });
  }
});

module.exports = router;


