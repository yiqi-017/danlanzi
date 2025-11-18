const express = require('express');
const { User } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

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

    // 返回完整用户信息（不包含密码）
    const userResponse = {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      student_id: user.student_id,
      avatar_path: user.avatar_path,
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

    // 头像数据由 userAvatar 路由处理

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
