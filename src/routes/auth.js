const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const { dataPath } = require('../config/datapath');
const { User, VerificationCode } = require('../models');
const router = express.Router();


// 用户注册接口
router.post('/register', async (req, res) => {
  try {
    const { nickname, email, password, verificationCode } = req.body;

    // 解析邮箱本地部分作为 student_id
    const studentIdFromEmail = (email || '').split('@')[0];

    // 检查邮箱是否已注册
    const existingUser = await User.findOne({
      where: { email: email }
    });

    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Email already registered'
      });
    }

    // 加密密码
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 检查是否是第一个用户，如果是则自动设置为管理员
    const userCount = await User.count();
    const userRole = userCount === 0 ? 'admin' : 'user';

    // 创建用户
    const newUser = await User.create({
      nickname: nickname,
      email: email,
      student_id: studentIdFromEmail,
      password_hash: passwordHash,
      security_email: email, // 自动将安全邮箱设置为注册邮箱
      role: userRole,
      status: 'active',
      theme: 'dark',
      language: 'zh-CN',
      show_student_id: true,
      show_department: true,
      show_major: true,
      show_bio: true
    });

    // 基于 dataPath 设置并创建默认头像目录，复制默认头像
    try {
      // 相对目录存库：user/[id]/avatar
      const relativeAvatarDir = path.join('user', String(newUser.id), 'avatar');
      const userAvatarDir = path.join(dataPath, relativeAvatarDir);
      const defaultAvatarSrc = path.join(dataPath, 'system', 'avatars', 'StudentKim.png');

      if (!fs.existsSync(userAvatarDir)) {
        fs.mkdirSync(userAvatarDir, { recursive: true });
      }

      // 仅当默认头像存在时执行复制
      if (fs.existsSync(defaultAvatarSrc)) {
        const destFile = path.join(userAvatarDir, 'Avatar.png');
        try {
          fs.copyFileSync(defaultAvatarSrc, destFile);
        } catch (copyErr) {
          console.warn('Copy default avatar failed:', copyErr);
        }
      } else {
        console.warn('Default avatar not found at:', defaultAvatarSrc);
      }

      // 数据库存相对路径
      await newUser.update({ avatar_path: relativeAvatarDir });
    } catch (fsErr) {
      console.warn('Avatar directory setup failed:', fsErr);
    }

    // 标记验证码为已使用
    await VerificationCode.update(
      { isUsed: true, usedAt: new Date() },
      { 
        where: { 
          email: email,
          code: verificationCode,
          type: 'email_verification'
        } 
      }
    );

    // 返回用户信息（不包含密码）
    const userResponse = {
      id: newUser.id,
      nickname: newUser.nickname,
      email: newUser.email,
      student_id: newUser.student_id,
      avatar_path: newUser.avatar_path,
      role: newUser.role,
      status: newUser.status,
      // 新增的用户偏好字段
      theme: newUser.theme,
      language: newUser.language,
      created_at: newUser.created_at
    };

    res.status(201).json({
      status: 'success',
      message: 'Registration successful',
      user: userResponse
    });

  } catch (error) {
    console.error('Registration failed:', error);
    
    // 处理数据库约束错误
    if (error.name === 'SequelizeUniqueConstraintError') {
      // 判断是否是 student_id 唯一冲突
      const isStudentIdConflict = error.errors?.some(e => e.path === 'student_id' || e.message?.includes('student_id'));
      const message = isStudentIdConflict ? 'StudentId already exists' : 'Email already registered';
      return res.status(400).json({
        status: 'error',
        message
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Registration failed',
      error: error.message
    });
  }
});

// 用户登录接口
router.post('/login', async (req, res) => {
  try {
    const { student_id, password } = req.body;

    // 查找用户
    const user = await User.findOne({
      where: { 
        student_id: student_id,
        status: 'active'
      }
    });

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid student ID or password'
      });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid student ID or password'
      });
    }

    // 生成 JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'default_secret_key',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // 返回用户信息（不包含密码）
    const userResponse = {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      role: user.role,
      status: user.status,
      // 新增的用户偏好字段
      theme: user.theme,
      language: user.language,
      created_at: user.created_at
    };

    res.json({
      status: 'success',
      message: 'Login successful',
      user: userResponse,
      token: token
    });

  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Login failed',
      error: error.message
    });
  }
});

// 获取安全邮箱接口（用于重置密码）
router.post('/get-security-email', async (req, res) => {
  try {
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Student ID is required'
      });
    }

    // 查找用户
    const user = await User.findOne({
      where: { 
        student_id: student_id,
        status: 'active'
      }
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'Student ID not found'
      });
    }

    if (!user.security_email) {
      return res.status(400).json({
        status: 'error',
        message: 'Security email not set'
      });
    }

    // 返回安全邮箱（部分隐藏）
    const email = user.security_email;
    const [localPart, domain] = email.split('@');
    const maskedEmail = localPart.length > 2 
      ? localPart.substring(0, 2) + '***' + '@' + domain
      : '***@' + domain;

    res.json({
      status: 'success',
      message: 'Security email retrieved successfully',
      data: {
        security_email: user.security_email,
        masked_email: maskedEmail
      }
    });

  } catch (error) {
    console.error('Get security email failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get security email',
      error: error.message
    });
  }
});

// 重置密码接口
router.post('/reset-password', async (req, res) => {
  try {
    const { student_id, security_email, verificationCode, newPassword } = req.body;

    // 验证参数
    if (!student_id || !security_email || !verificationCode || !newPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required'
      });
    }

    // 查找用户
    const user = await User.findOne({
      where: { 
        student_id: student_id,
        security_email: security_email,
        status: 'active'
      }
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found or security email mismatch'
      });
    }

    // 验证验证码
    const verificationCodeRecord = await VerificationCode.findOne({
      where: {
        email: security_email,
        code: verificationCode,
        type: 'password_reset',
        isUsed: false,
        expiresAt: {
          [require('sequelize').Op.gt]: new Date()
        }
      }
    });

    if (!verificationCodeRecord) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired verification code'
      });
    }

    // 验证密码长度
    if (newPassword.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters'
      });
    }

    // 加密新密码
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // 更新密码
    await user.update({
      password_hash: passwordHash
    });

    // 标记验证码为已使用
    await verificationCodeRecord.update({
      isUsed: true,
      usedAt: new Date()
    });

    res.json({
      status: 'success',
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset password',
      error: error.message
    });
  }
});


module.exports = router;
