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

    // 创建用户
    const newUser = await User.create({
      nickname: nickname,
      email: email,
      student_id: studentIdFromEmail,
      password_hash: passwordHash,
      role: 'user',
      status: 'active'
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
    const { email, password } = req.body;

    // 查找用户
    const user = await User.findOne({
      where: { 
        email: email,
        status: 'active'
      }
    });

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
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


module.exports = router;
