const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { User } = require('../models');
const { dataPath } = require('../config/datapath');
const router = express.Router();

// 配置 multer 用于头像上传
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB 限制
  },
  fileFilter: (req, file, cb) => {
    // 检查文件类型
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'), false);
    }
  }
});

// JWT 验证中间件
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
    req.user = user;
    next();
  });
};

// 获取用户信息接口
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // 读取头像为 dataURL（若存在）
    let avatar_data_url = null;
    try {
      if (user.avatar_path) {
        const absoluteAvatarDir = path.join(dataPath, user.avatar_path);
        const avatarFile = path.join(absoluteAvatarDir, 'Avatar.png');
        if (fs.existsSync(avatarFile)) {
          const buf = fs.readFileSync(avatarFile);
          const b64 = buf.toString('base64');
          avatar_data_url = `data:image/png;base64,${b64}`;
        }
      }
    } catch (e) {
      // 头像读取失败时不影响整体返回
    }

    // 返回完整用户信息（不包含密码）
    const userResponse = {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      student_id: user.student_id,
      avatar_path: user.avatar_path,
      avatar_data_url,
      role: user.role,
      status: user.status,
      department: user.department,
      major: user.major,
      bio: user.bio,
      security_email: user.security_email,
      theme: user.theme,
      language: user.language,
      show_student_id: user.show_student_id,
      show_department: user.show_department,
      show_major: user.show_major,
      show_bio: user.show_bio,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    res.json({
      status: 'success',
      message: 'User profile retrieved successfully',
      user: userResponse
    });

  } catch (error) {
    console.error('Get user profile failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve user profile',
      error: error.message
    });
  }
});

// 换头像接口 - 支持直接文件上传
router.post('/avatar', authenticateToken, (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          status: 'error',
          message: '请使用字段名 "avatar" 上传文件'
        });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          status: 'error',
          message: '文件大小不能超过 5MB'
        });
      }
      if (err.message === '只允许上传图片文件') {
        return res.status(400).json({
          status: 'error',
          message: '只允许上传图片文件'
        });
      }
      return res.status(400).json({
        status: 'error',
        message: '文件上传失败: ' + err.message
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    // 验证文件是否上传
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: '请选择要上传的头像文件'
      });
    }

    // 验证用户ID（可选，如果前端传了的话）
    const userId = req.body.userId;
    if (userId && userId !== req.user.userId) {
      return res.status(403).json({
        status: 'error',
        message: '无权限修改其他用户的头像'
      });
    }

    // 查找用户
    const user = await User.findByPk(req.user.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: '用户不存在'
      });
    }

    // 验证文件大小（5MB 限制）
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        status: 'error',
        message: '头像文件大小不能超过 5MB'
      });
    }

    // 验证文件类型
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        status: 'error',
        message: '只允许上传图片文件'
      });
    }

    // 创建用户头像目录（参考 auth.js 中的逻辑）
    const relativeAvatarDir = path.join('user', String(user.id), 'avatar');
    const absoluteAvatarDir = path.join(dataPath, relativeAvatarDir);
    
    // 确保目录存在
    if (!fs.existsSync(absoluteAvatarDir)) {
      fs.mkdirSync(absoluteAvatarDir, { recursive: true });
    }

    // 保存头像文件（统一保存为 Avatar.png）
    const avatarFileName = 'Avatar.png';
    const avatarFilePath = path.join(absoluteAvatarDir, avatarFileName);
    
    // 使用 sharp 将图片转换为 PNG 格式（保持原图尺寸）
    try {
      await sharp(req.file.buffer)
        .png() // 转换为 PNG 格式，保持原图尺寸和质量
        .toFile(avatarFilePath);
      
      console.log('头像转换并保存成功:', avatarFilePath);
    } catch (sharpError) {
      console.error('图片处理失败:', sharpError);
      return res.status(500).json({
        status: 'error',
        message: '图片处理失败，请检查图片格式是否正确'
      });
    }

    // 更新数据库中的头像路径
    await user.update({ avatar_path: relativeAvatarDir });

    // 获取转换后的文件信息
    const convertedFileStats = fs.statSync(avatarFilePath);
    
    // 获取原图尺寸信息
    const imageInfo = await sharp(avatarFilePath).metadata();
    
    // 返回成功响应
    res.json({
      status: 'success',
      message: '头像更新成功',
      avatar_path: relativeAvatarDir,
      file_info: {
        originalname: req.file.originalname,
        original_size: req.file.size,
        original_mimetype: req.file.mimetype,
        converted_size: convertedFileStats.size,
        converted_format: 'PNG',
        dimensions: `${imageInfo.width}x${imageInfo.height}`
      }
    });

  } catch (error) {
    console.error('换头像失败:', error);
    res.status(500).json({
      status: 'error',
      message: '头像更新失败',
      error: error.message
    });
  }
});

// 更新用户资料和隐私设置接口（合并）
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { 
      // 用户资料字段
      nickname, 
      department, 
      major, 
      bio, 
      security_email,
      theme,
      language,
      // 隐私设置字段
      show_student_id, 
      show_department, 
      show_major, 
      show_bio 
    } = req.body;

    // 查找用户
    const user = await User.findByPk(req.user.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // 构建更新数据对象
    const updateData = {};
    
    // 用户资料字段
    if (nickname !== undefined) updateData.nickname = nickname;
    if (department !== undefined) updateData.department = department;
    if (major !== undefined) updateData.major = major;
    if (bio !== undefined) updateData.bio = bio;
    if (security_email !== undefined) updateData.security_email = security_email;
    if (theme !== undefined) updateData.theme = theme;
    if (language !== undefined) updateData.language = language;
    
    // 隐私设置字段
    if (show_student_id !== undefined) updateData.show_student_id = show_student_id;
    if (show_department !== undefined) updateData.show_department = show_department;
    if (show_major !== undefined) updateData.show_major = show_major;
    if (show_bio !== undefined) updateData.show_bio = show_bio;

    // 更新用户信息
    await user.update(updateData);

    // 返回更新后的用户信息
    const userResponse = {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      student_id: user.student_id,
      avatar_path: user.avatar_path,
      role: user.role,
      status: user.status,
      // 用户资料字段
      department: user.department,
      major: user.major,
      bio: user.bio,
      security_email: user.security_email,
      theme: user.theme,
      language: user.language,
      // 隐私控制字段
      show_student_id: user.show_student_id,
      show_department: user.show_department,
      show_major: user.show_major,
      show_bio: user.show_bio,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    res.json({
      status: 'success',
      message: 'User profile updated successfully',
      user: userResponse
    });

  } catch (error) {
    console.error('Update user profile failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user profile',
      error: error.message
    });
  }
});

// 获取其他用户公开资料接口
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 查找用户
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // 根据隐私设置构建公开信息
    const publicProfile = {
      id: user.id,
      nickname: user.nickname,
      avatar_path: user.avatar_path,
      role: user.role,
      created_at: user.created_at
    };

    // 根据隐私设置添加字段
    if (user.show_student_id) {
      publicProfile.student_id = user.student_id;
    }
    if (user.show_department) {
      publicProfile.department = user.department;
    }
    if (user.show_major) {
      publicProfile.major = user.major;
    }
    if (user.show_bio) {
      publicProfile.bio = user.bio;
    }

    // 读取头像为 dataURL（若存在）
    let avatar_data_url = null;
    try {
      if (user.avatar_path) {
        const absoluteAvatarDir = path.join(dataPath, user.avatar_path);
        const avatarFile = path.join(absoluteAvatarDir, 'Avatar.png');
        if (fs.existsSync(avatarFile)) {
          const buf = fs.readFileSync(avatarFile);
          const b64 = buf.toString('base64');
          avatar_data_url = `data:image/png;base64,${b64}`;
        }
      }
    } catch (e) {
      // 头像读取失败时不影响整体返回
    }
    
    publicProfile.avatar_data_url = avatar_data_url;

    res.json({
      status: 'success',
      message: 'Public profile retrieved successfully',
      user: publicProfile
    });

  } catch (error) {
    console.error('Get public profile failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve public profile',
      error: error.message
    });
  }
});

module.exports = router;
