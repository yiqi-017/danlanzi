const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { User } = require('../models');
const { dataPath } = require('../config/datapath');
const router = express.Router();

// JWT 验证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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

module.exports = router;
