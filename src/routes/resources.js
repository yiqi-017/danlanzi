const express = require('express');
const multer = require('multer');
const { authenticateToken, optionalAuthenticateToken } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const { sequelize, Resource, ResourceCourseLink, ResourceStat, ResourceFavorite, ResourceLike, CourseOffering, Course, User } = require('../models');
const { Op } = require('sequelize');
const { createNotification } = require('../utils/notificationHelper');

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
      offering_id = null,
      tags = null
    } = req.body || {};
    
    // 处理tags：如果是字符串，尝试解析为JSON数组
    let tagsArray = null;
    if (tags) {
      if (typeof tags === 'string') {
        try {
          tagsArray = JSON.parse(tags);
        } catch (e) {
          // 如果不是JSON，当作单个标签处理
          tagsArray = [tags.trim()].filter(t => t);
        }
      } else if (Array.isArray(tags)) {
        tagsArray = tags.filter(t => t && typeof t === 'string' && t.trim()).map(t => t.trim());
      }
      
      // 确保是数组格式
      if (tagsArray && tagsArray.length === 0) {
        tagsArray = null;
      }
    }

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
      status: 'normal',
      tags: tagsArray
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

// 获取资源列表（可选认证，登录用户可以看到收藏状态）
router.get('/', optionalAuthenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, course_id, offering_id, search, uploader_id, favorite } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 构建查询条件
    let whereClause = {};
    
    // 如果指定了uploader_id，筛选发布的资源
    if (uploader_id) {
      if (uploader_id === 'current' && req.user && req.user.userId) {
        // 当前用户发布的资源：可以看到自己的normal和hidden资源
        whereClause = {
          uploader_id: req.user.userId,
          status: { [Op.in]: ['normal', 'hidden'] }
        };
      } else if (!isNaN(parseInt(uploader_id))) {
        // 指定用户ID发布的资源：只能看到normal
        whereClause = {
          uploader_id: parseInt(uploader_id),
          status: 'normal'
        };
      }
    } else {
      // 没有指定uploader_id：只显示normal资源
      whereClause.status = 'normal';
    }

    // 如果指定了favorite，筛选收藏的资源（需要用户已登录）
    let favoriteResourceIds = null;
    if (favorite === 'true' || favorite === true) {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required to view favorited resources'
        });
      }
      // 获取用户收藏的资源ID列表
      const favorites = await ResourceFavorite.findAll({
        where: {
          user_id: req.user.userId
        },
        attributes: ['resource_id']
      });
      favoriteResourceIds = favorites.map(f => f.resource_id);
      
      if (favoriteResourceIds.length === 0) {
        // 如果没有收藏的资源，直接返回空结果
        return res.json({
          status: 'success',
          message: 'Resources retrieved successfully',
          data: {
            resources: [],
            pagination: {
              total: 0,
              page: parseInt(page),
              limit: parseInt(limit),
              totalPages: 0
            }
          }
        });
      }
    }

    // 如果指定了course_id或offering_id，需要通过ResourceCourseLink关联查询
    let resourceIds = null;
    if (course_id || offering_id) {
      const linkWhere = {};
      if (course_id) linkWhere.course_id = course_id;
      if (offering_id) linkWhere.offering_id = offering_id;

      const links = await ResourceCourseLink.findAll({
        where: linkWhere,
        attributes: ['resource_id']
      });
      resourceIds = links.map(link => link.resource_id);
      
      if (resourceIds.length === 0) {
        // 如果没有关联的资源，直接返回空结果
        return res.json({
          status: 'success',
          message: 'Resources retrieved successfully',
          data: {
            resources: [],
            pagination: {
              total: 0,
              page: parseInt(page),
              limit: parseInt(limit),
              totalPages: 0
            }
          }
        });
      }
      whereClause.id = { [Op.in]: resourceIds };
    }

    // 如果指定了收藏筛选，需要合并到resourceIds中
    if (favoriteResourceIds) {
      if (whereClause.id) {
        // 如果已经有resourceIds（比如从course_id筛选），取交集
        const existingIds = Array.isArray(whereClause.id[Op.in]) 
          ? whereClause.id[Op.in] 
          : [whereClause.id[Op.in]];
        const intersection = existingIds.filter(id => favoriteResourceIds.includes(id));
        if (intersection.length === 0) {
          return res.json({
            status: 'success',
            message: 'Resources retrieved successfully',
            data: {
              resources: [],
              pagination: {
                total: 0,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: 0
              }
            }
          });
        }
        whereClause.id = { [Op.in]: intersection };
      } else {
        whereClause.id = { [Op.in]: favoriteResourceIds };
      }
    }

    // 如果有搜索关键词，需要搜索多个字段
    let searchResourceIds = null;
    if (search) {
      const searchTerm = `%${search}%`;
      const escapedSearch = search.replace(/'/g, "''").replace(/\\/g, '\\\\');
      
      // 1. 搜索资源本身的字段（title, description, tags）
      const resourceSearchIds = await Resource.findAll({
        where: {
          status: 'normal',
          [Op.or]: [
            { title: { [Op.like]: searchTerm } },
            { description: { [Op.like]: searchTerm } },
            sequelize.literal(`JSON_SEARCH(tags, 'one', ${sequelize.escape(escapedSearch)}) IS NOT NULL`)
          ]
        },
        attributes: ['id']
      });
      
      // 2. 搜索关联的课程和开课信息
      const courseSearchIds = await Course.findAll({
        where: {
          [Op.or]: [
            { name: { [Op.like]: searchTerm } },
            { dept: { [Op.like]: searchTerm } }
          ]
        },
        attributes: ['id'],
        include: [{
          model: CourseOffering,
          as: 'offerings',
          required: false,
          attributes: ['id']
        }]
      });
      
      // 3. 搜索开课老师
      const instructorSearchIds = await CourseOffering.findAll({
        where: sequelize.literal(`(JSON_SEARCH(instructor, 'one', ${sequelize.escape(escapedSearch)}) IS NOT NULL)`),
        attributes: ['id']
      });
      
      // 收集所有相关的course_id和offering_id
      const allCourseIds = courseSearchIds.map(c => c.id);
      const allOfferingIds = new Set();
      courseSearchIds.forEach(course => {
        course.offerings?.forEach(offering => {
          allOfferingIds.add(offering.id);
        });
      });
      instructorSearchIds.forEach(offering => {
        allOfferingIds.add(offering.id);
      });
      
      // 通过course_id和offering_id查找关联的资源
      const linkSearchIds = [];
      
      if (allCourseIds.length > 0 || allOfferingIds.size > 0) {
        const linkWhere = {
          [Op.or]: []
        };
        
        if (allCourseIds.length > 0) {
          linkWhere[Op.or].push({ course_id: { [Op.in]: allCourseIds } });
        }
        if (allOfferingIds.size > 0) {
          linkWhere[Op.or].push({ offering_id: { [Op.in]: Array.from(allOfferingIds) } });
        }
        
        const links = await ResourceCourseLink.findAll({
          where: linkWhere,
          attributes: ['resource_id']
        });
        linkSearchIds.push(...links.map(l => l.resource_id));
      }
      
      // 合并所有搜索结果
      const allSearchIds = new Set();
      resourceSearchIds.forEach(r => allSearchIds.add(r.id));
      linkSearchIds.forEach(id => allSearchIds.add(id));
      
      searchResourceIds = Array.from(allSearchIds);
      
      if (searchResourceIds.length === 0) {
        // 如果没有搜索结果，直接返回空结果
        return res.json({
          status: 'success',
          message: 'Resources retrieved successfully',
          data: {
            resources: [],
            pagination: {
              total: 0,
              page: parseInt(page),
              limit: parseInt(limit),
              totalPages: 0
            }
          }
        });
      }
      
      // 如果已经有course_id或offering_id的过滤，需要取交集
      if (resourceIds) {
        searchResourceIds = searchResourceIds.filter(id => resourceIds.includes(id));
        if (searchResourceIds.length === 0) {
          return res.json({
            status: 'success',
            message: 'Resources retrieved successfully',
            data: {
              resources: [],
              pagination: {
                total: 0,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: 0
              }
            }
          });
        }
      }
      
      whereClause.id = { [Op.in]: searchResourceIds };
    }

    // 查询资源
    const { count, rows: resources } = await Resource.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']],
          include: [
            {
              model: User,
              as: 'uploader',
              required: false,
              attributes: ['id', 'nickname', 'avatar_path']
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

    // 如果用户已登录，检查每个资源是否被收藏和点赞
    let favoritedResourceIds = new Set();
    let likedResourceIds = new Set();
    if (req.user && req.user.userId) {
      const resourceIds = resources.map(r => r.id);
      if (resourceIds.length > 0) {
        const favorites = await ResourceFavorite.findAll({
          where: {
            user_id: req.user.userId,
            resource_id: { [Op.in]: resourceIds }
          },
          attributes: ['resource_id']
        });
        favoritedResourceIds = new Set(favorites.map(f => f.resource_id));

        const likes = await ResourceLike.findAll({
          where: {
            user_id: req.user.userId,
            resource_id: { [Op.in]: resourceIds }
          },
          attributes: ['resource_id']
        });
        likedResourceIds = new Set(likes.map(l => l.resource_id));
      }
    }

    // 为每个资源添加收藏状态和点赞状态
    const resourcesWithFavorite = resources.map(resource => {
      const resourceJson = resource.toJSON();
      resourceJson.isFavorited = favoritedResourceIds.has(resource.id);
      resourceJson.isLiked = likedResourceIds.has(resource.id);
      // 确保stats存在，如果不存在则提供默认值
      if (!resourceJson.stats) {
        resourceJson.stats = {
          favorite_count: 0,
          like_count: 0,
          download_count: 0,
          view_count: 0
        };
      }
      return resourceJson;
    });

    res.json({
      status: 'success',
      message: 'Resources retrieved successfully',
      data: {
        resources: resourcesWithFavorite,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('获取资源列表失败:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve resources',
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

    // 检查是否已经收藏
    const existingFavorite = await ResourceFavorite.findOne({
      where: { user_id: req.user.userId, resource_id: resourceId }
    });

    if (existingFavorite) {
      // 已经收藏，直接返回成功
      return res.status(200).json({ status: 'success', message: '已收藏' });
    }

    // 创建收藏
    await ResourceFavorite.create({
      user_id: req.user.userId,
      resource_id: resourceId
    });

    // 递增收藏数（使用findOrCreate避免重复创建统计记录）
    const [stat, created] = await ResourceStat.findOrCreate({
      where: { resource_id: resourceId },
      defaults: { resource_id: resourceId, favorite_count: 0 }
    });

    // 递增收藏数
    await stat.increment('favorite_count');

    // 通知资源上传者
    if (resource.uploader_id !== req.user.userId) {
      await createNotification({
        user_id: resource.uploader_id,
        type: 'resource',
        title: '你的资源被收藏了',
        content: `用户收藏了你的资源「${resource.title || '未命名资源'}」`,
        entity_type: 'resource',
        entity_id: resourceId
      });
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

    // 通知资源上传者
    if (resource.uploader_id !== req.user.userId) {
      await createNotification({
        user_id: resource.uploader_id,
        type: 'resource',
        title: '你的资源被点赞了',
        content: `用户点赞了你的资源「${resource.title || '未命名资源'}」`,
        entity_type: 'resource',
        entity_id: resourceId
      });
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

// 更新资源
router.put('/:id', authenticateToken, (req, res, next) => {
  // 如果是 multipart/form-data，使用 multer 处理（不管是否有文件）
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ status: 'error', message: '文件大小不能超过 20MB' });
        }
        return res.status(400).json({ status: 'error', message: '文件上传失败: ' + err.message });
      }
      next();
    });
  } else {
    next();
  }
}, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    // 查找资源
    const resource = await Resource.findByPk(id);
    if (!resource) {
      return res.status(404).json({ status: 'error', message: 'Resource not found' });
    }
    
    // 检查权限：只有资源发布者可以编辑
    if (resource.uploader_id !== userId) {
      return res.status(403).json({ status: 'error', message: 'You can only edit your own resources' });
    }
    
    const {
      type,
      title,
      description = '',
      url_or_path = '',
      visibility = 'public',
      course_id = null,
      offering_id = null,
      tags = null
    } = req.body || {};
    
    // 处理tags
    let tagsArray = null;
    if (tags) {
      if (typeof tags === 'string') {
        try {
          tagsArray = JSON.parse(tags);
        } catch (e) {
          tagsArray = [tags.trim()].filter(t => t);
        }
      } else if (Array.isArray(tags)) {
        tagsArray = tags.filter(t => t && typeof t === 'string' && t.trim()).map(t => t.trim());
      }
      if (tagsArray && tagsArray.length === 0) {
        tagsArray = null;
      }
    }
    
    // 基本校验
    const allowedTypes = ['file', 'link', 'note'];
    const allowedVisibility = ['public', 'course', 'private'];
    
    if (type && !allowedTypes.includes(type)) {
      return res.status(400).json({ status: 'error', message: 'type 必须是 file/link/note' });
    }
    if (title && (typeof title !== 'string' || title.trim().length === 0)) {
      return res.status(400).json({ status: 'error', message: 'title 必填' });
    }
    if (visibility && !allowedVisibility.includes(visibility)) {
      return res.status(400).json({ status: 'error', message: 'visibility 必须是 public/course/private' });
    }
    
    // 构建更新数据
    const updateData = {};
    if (type) updateData.type = type;
    if (title) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (visibility) updateData.visibility = visibility;
    if (tagsArray !== undefined) updateData.tags = tagsArray;
    
    // 处理文件上传
    if (type === 'file' && req.file) {
      // 删除旧文件（如果存在）
      if (resource.url_or_path && resource.type === 'file') {
        const oldFilePath = path.join(USER_BASE_DIR, resource.url_or_path);
        if (fs.existsSync(oldFilePath)) {
          try {
            fs.unlinkSync(oldFilePath);
          } catch (err) {
            console.error('Failed to delete old file:', err);
          }
        }
      }
      updateData.url_or_path = path.join('user', String(userId), RESOURCES_SUB_DIR, req.file.filename).replace(/\\/g, '/');
    } else if (type === 'link' && url_or_path) {
      updateData.url_or_path = url_or_path.trim();
    } else if (type === 'note') {
      updateData.url_or_path = (url_or_path || '').trim();
    }
    
    // 如果资源之前是隐藏状态，编辑后保持隐藏状态并进入待复核队列
    const wasHidden = resource.status === 'hidden';
    if (wasHidden) {
      // 保持隐藏状态
      updateData.status = 'hidden';
    }
    
    // 添加调试日志
    console.log('Update resource - before update:', {
      id,
      updateData,
      currentDescription: resource.description
    });
    
    // 更新资源
    await resource.update(updateData);
    
    // 添加调试日志
    console.log('Update resource - after update:', {
      id,
      newDescription: resource.description
    });
    
    // 更新课程关联
    if (course_id !== null || offering_id !== null) {
      // 删除旧关联
      await ResourceCourseLink.destroy({
        where: { resource_id: id }
      });
      // 创建新关联
      if (course_id || offering_id) {
        await ResourceCourseLink.create({
          resource_id: id,
          course_id: course_id || null,
          offering_id: offering_id || null
        });
      }
    }
    
    // 如果资源之前是隐藏状态，编辑后需要进入审核队列
    if (wasHidden) {
      const { updateOrCreateModerationQueue } = require('./moderation');
      await updateOrCreateModerationQueue('resource', id, 0);
      // 设置审核队列状态为 pending_review
      const { ModerationQueue } = require('../models');
      const moderationItem = await ModerationQueue.findOne({
        where: {
          entity_type: 'resource',
          entity_id: id
        }
      });
      if (moderationItem) {
        await moderationItem.update({ status: 'pending_review' });
      }
    }
    
    // 重新加载资源以获取最新数据
    await resource.reload();
    
    console.log('Update resource - after reload:', {
      id,
      finalDescription: resource.description
    });
    
    return res.json({
      status: 'success',
      message: 'Resource updated successfully',
      data: resource
    });
  } catch (error) {
    console.error('Update resource failed:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to update resource',
      error: error.message
    });
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


