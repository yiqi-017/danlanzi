const express = require('express');
const { body, validationResult } = require('express-validator');
const { VerificationCode } = require('../models');
const nodemailer = require('nodemailer');
const router = express.Router();

// 创建邮件传输器
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER, // Gmail 邮箱地址
      pass: process.env.EMAIL_PASS  // Gmail 应用专用密码
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// 生成6位随机验证码
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// 发送验证码邮件接口
router.post('/send-verification-code', [
  body('to').isEmail().withMessage('收件人邮箱格式不正确'),
  body('subject').notEmpty().withMessage('邮件标题不能为空'),
  body('text').notEmpty().withMessage('邮件文本内容不能为空'),
  body('type').optional().isIn(['email_verification', 'password_reset', 'login']).withMessage('验证码类型不正确')
], async (req, res) => {
  try {
    // 验证请求参数
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Parameter validation failed',
        errors: errors.array()
      });
    }

    const { to, subject, text, type = 'email_verification' } = req.body;

    // 检查邮箱配置
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({
        status: 'error',
        message: 'Gmail email service not configured, please check EMAIL_USER and EMAIL_PASS environment variables'
      });
    }

    // 生成6位验证码
    const code = generateVerificationCode();
    
    // 设置过期时间（5分钟后）
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // 将之前的验证码标记为已使用
    await VerificationCode.update(
      { isUsed: true, usedAt: new Date() },
      { 
        where: { 
          email: to, 
          type: type,
          isUsed: false 
        } 
      }
    );

    // 存储验证码到数据库
    await VerificationCode.create({
      email: to,
      code: code,
      type: type,
      expiresAt: expiresAt,
      isUsed: false
    });

    // 创建邮件传输器
    const transporter = createTransporter();

    // 邮件配置
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      text: `${text}${code}`,
      html: `${text}${code}`
    };

    // 发送邮件
    const info = await transporter.sendMail(mailOptions);

    res.json({
      status: 'success',
      message: 'Verification code sent successfully',
      messageId: info.messageId,
      expiresAt: expiresAt
    });

  } catch (error) {
    console.error('Verification code sending failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send verification code',
      error: error.message
    });
  }
});

// 验证验证码接口
router.post('/verify-code', [
  body('email').isEmail().withMessage('邮箱格式不正确'),
  body('code').isLength({ min: 6, max: 6 }).withMessage('验证码必须是6位数字'),
  body('type').optional().isIn(['email_verification', 'password_reset', 'login']).withMessage('验证码类型不正确')
], async (req, res) => {
  try {
    // 验证请求参数
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Parameter validation failed',
        errors: errors.array()
      });
    }

    const { email, code, type = 'email_verification' } = req.body;

    // 查找验证码
    const verificationCode = await VerificationCode.findOne({
      where: {
        email: email,
        code: code,
        type: type,
        isUsed: false,
        expiresAt: {
          [require('sequelize').Op.gt]: new Date() // 未过期
        }
      }
    });

    if (!verificationCode) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired verification code'
      });
    }

    // 标记验证码为已使用
    await verificationCode.update({
      isUsed: true,
      usedAt: new Date()
    });

    res.json({
      status: 'success',
      message: 'Verification code verified successfully'
    });

  } catch (error) {
    console.error('Verification code verification failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify verification code',
      error: error.message
    });
  }
});

module.exports = router;
