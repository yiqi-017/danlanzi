const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const { sequelize, Resource, ResourceCourseLink, ResourceStat, ResourceFavorite, ResourceLike } = require('../models');

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

// 取消收藏资源
router.delete('/:id/favorite', authenticateToken, async (req, res) => {
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

    // 删除收藏关系（幂等）
    await ResourceFavorite.destroy({ where: { user_id: req.user.userId, resource_id: resourceId } });

    // 统计递减但不低于 0
    const [affected] = await ResourceStat.update(
      { favorite_count: sequelize.literal('CASE WHEN favorite_count > 0 THEN favorite_count - 1 ELSE 0 END') },
      { where: { resource_id: resourceId } }
    );

    if (!affected || (Array.isArray(affected) && affected[0] === 0)) {
      // 如果统计不存在则补建为 0
      await ResourceStat.create({ resource_id: resourceId, favorite_count: 0 });
    }

    return res.status(200).json({ status: 'success', message: '已取消收藏' });
  } catch (error) {
    console.error('Unfavorite resource failed:', error);
    return res.status(500).json({ status: 'error', message: '取消收藏失败', error: error.message });
  }
});

// 点赞资源
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const resourceId = Number(req.params.id);
    if (!resourceId || Number.isNaN(resourceId)) {
      return res.status(400).json({ status: 'error', message: '无效的资源ID' });
    }

    const resource = await Resource.findByPk(resourceId);
    if (!resource) {
      return res.status(404).json({ status: 'error', message: '资源不存在' });
    }

    await ResourceLike.findOrCreate({
      where: { user_id: req.user.userId, resource_id: resourceId },
      defaults: { user_id: req.user.userId, resource_id: resourceId }
    });

    const [affected] = await ResourceStat.increment(
      { like_count: 1 },
      { where: { resource_id: resourceId } }
    );
    if (!affected || (Array.isArray(affected) && affected[0] === 0)) {
      await ResourceStat.create({ resource_id: resourceId, like_count: 1 });
    }

    return res.status(200).json({ status: 'success', message: '点赞成功' });
  } catch (error) {
    console.error('Like resource failed:', error);
    return res.status(500).json({ status: 'error', message: '点赞失败', error: error.message });
  }
});

// 取消点赞资源
router.delete('/:id/like', authenticateToken, async (req, res) => {
  try {
    const resourceId = Number(req.params.id);
    if (!resourceId || Number.isNaN(resourceId)) {
      return res.status(400).json({ status: 'error', message: '无效的资源ID' });
    }

    const resource = await Resource.findByPk(resourceId);
    if (!resource) {
      return res.status(404).json({ status: 'error', message: '资源不存在' });
    }

    await ResourceLike.destroy({ where: { user_id: req.user.userId, resource_id: resourceId } });

    const [affected] = await ResourceStat.update(
      { like_count: sequelize.literal('CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END') },
      { where: { resource_id: resourceId } }
    );
    if (!affected || (Array.isArray(affected) && affected[0] === 0)) {
      await ResourceStat.create({ resource_id: resourceId, like_count: 0 });
    }

    return res.status(200).json({ status: 'success', message: '已取消点赞' });
  } catch (error) {
    console.error('Unlike resource failed:', error);
    return res.status(500).json({ status: 'error', message: '取消点赞失败', error: error.message });
  }
});

// 下载资源
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const resourceId = Number(req.params.id);
    if (!resourceId || Number.isNaN(resourceId)) {
      return res.status(400).json({ status: 'error', message: '无效的资源ID' });
    }

    const resource = await Resource.findByPk(resourceId);
    if (!resource) {
      return res.status(404).json({ status: 'error', message: '资源不存在' });
    }

    if (resource.type !== 'file') {
      return res.status(400).json({ status: 'error', message: '只有文件类型资源可下载' });
    }

    const filePath = path.join(__dirname, '../../../dlz-database', resource.url_or_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ status: 'error', message: '文件不存在' });
    }

    // 更新下载统计
    await ResourceStat.increment(
      { download_count: 1 },
      { where: { resource_id: resourceId } }
    );

    // 设置下载响应头
    const fileName = path.basename(resource.url_or_path);
    const fileExt = path.extname(fileName); // 获取原文件后缀
    const downloadName = resource.title + fileExt; // title + 后缀
    
    // 标准双重编码兼容方案
    const encodedFileName = encodeURIComponent(downloadName); // UTF-8 编码
    const asciiFileName = downloadName.replace(/[^\x00-\x7F]/g, '_'); // ASCII 兼容版本
    
    console.log('【下载文件】原始文件名（path.basename结果）：', fileName);
    console.log('【下载文件】提取的文件后缀：', fileExt);
    console.log('【下载文件】拼接后的下载文件名：', downloadName);
    console.log('【下载文件】UTF-8编码后的文件名：', encodedFileName);
    console.log('【下载文件】ASCII兼容文件名（替换非ASCII并转义引号）：', asciiFileName);

    // 同时声明两种格式：filename（兼容旧客户端）和 filename*（RFC 5987 标准）
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFileName}"; filename*=utf-8''${encodedFileName}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');

    // 发送文件
    res.sendFile(filePath);
  } catch (error) {
    console.error('Download resource failed:', error);
    return res.status(500).json({ status: 'error', message: '下载失败', error: error.message });
  }
});

// 删除资源
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const resourceId = Number(req.params.id);
    if (!resourceId || Number.isNaN(resourceId)) {
      return res.status(400).json({ status: 'error', message: '无效的资源ID' });
    }

    const resource = await Resource.findByPk(resourceId);
    if (!resource) {
      return res.status(404).json({ status: 'error', message: '资源不存在' });
    }

    // 检查权限：只有上传者或管理员可删除
    if (resource.uploader_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: '无权限删除此资源' });
    }

    // 删除文件（如果是文件类型）
    if (resource.type === 'file' && resource.url_or_path) {
      const filePath = path.join(__dirname, '../../../dlz-database', resource.url_or_path);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (fileErr) {
          console.error('Delete file failed:', fileErr);
          // 继续删除数据库记录，不阻断流程
        }
      }
    }

    // 删除所有相关数据（使用事务确保一致性）
    await sequelize.transaction(async (t) => {
      // 删除统计信息
      await ResourceStat.destroy({ where: { resource_id: resourceId }, transaction: t });
      
      // 删除收藏记录
      await ResourceFavorite.destroy({ where: { resource_id: resourceId }, transaction: t });
      
      // 删除点赞记录
      await ResourceLike.destroy({ where: { resource_id: resourceId }, transaction: t });
      
      // 删除课程关联
      await ResourceCourseLink.destroy({ where: { resource_id: resourceId }, transaction: t });
      
      // 最后删除资源本身
      await Resource.destroy({ where: { id: resourceId }, transaction: t });
    });

    return res.status(200).json({ status: 'success', message: '资源删除成功' });
  } catch (error) {
    console.error('Delete resource failed:', error);
    return res.status(500).json({ status: 'error', message: '删除失败', error: error.message });
  }
});

module.exports = router;


