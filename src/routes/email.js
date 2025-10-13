const express = require('express');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
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

// 导出 createTransporter 供其他模块使用
module.exports.createTransporter = createTransporter;

// 发送邮件接口
router.post('/send', [
  body('to').isEmail().withMessage('Invalid email format'),
  body('subject').notEmpty().withMessage('Email subject cannot be empty'),
  body('text').notEmpty().withMessage('Email content cannot be empty')
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

    const { to, subject, text, html } = req.body;

    // 检查邮箱配置
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return res.status(500).json({
        status: 'error',
        message: 'Gmail email service not configured, please check EMAIL_USER and EMAIL_PASS environment variables',
        help: 'Please refer to documentation to configure Gmail app password'
      });
    }

    // 创建邮件传输器
    const transporter = createTransporter();

    // 邮件配置
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: subject,
      text: text,
      html: html || text
    };

    // 发送邮件
    const info = await transporter.sendMail(mailOptions);

    res.json({
      status: 'success',
      message: 'Email sent successfully',
      messageId: info.messageId
    });

  } catch (error) {
    console.error('Email sending failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send email',
      error: error.message
    });
  }
});

// 测试邮件配置接口
router.get('/test-config', async (req, res) => {
  const hasEmailUser = !!process.env.EMAIL_USER;
  const hasEmailPass = !!process.env.EMAIL_PASS;
  
  if (!hasEmailUser || !hasEmailPass) {
    return res.json({
      status: 'error',
      message: 'Gmail configuration incomplete',
      config: {
        emailUser: hasEmailUser ? 'Configured' : 'Not configured',
        emailPass: hasEmailPass ? 'Configured' : 'Not configured',
        isReady: false
      },
      help: 'Please configure EMAIL_USER and EMAIL_PASS environment variables'
    });
  }

  // 测试 Gmail 连接
  try {
    const transporter = createTransporter();
    await transporter.verify();
    
    res.json({
      status: 'success',
      message: 'Gmail configuration correct, connection test successful',
      config: {
        emailUser: process.env.EMAIL_USER,
        emailPass: 'Configured',
        isReady: true
      }
    });
  } catch (error) {
    res.json({
      status: 'error',
      message: 'Gmail connection test failed',
      config: {
        emailUser: process.env.EMAIL_USER,
        emailPass: 'Configured',
        isReady: false
      },
      error: error.message,
      help: 'Please check if Gmail app password is correct'
    });
  }
});

module.exports = router;
