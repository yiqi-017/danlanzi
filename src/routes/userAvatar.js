const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { Readable } = require('stream');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const { User } = require('../models');
const { dataPath } = require('../config/datapath');
const router = express.Router();

// 系统头像目录路径
const SYSTEM_AVATARS_PATH = path.join(__dirname, '../../../dlz-database/system/avatars');

// 配置 multer 用于头像上传
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB 限制
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

/**
 * 获取系统头像文件列表
 * GET /api/userAvatar/system
 * 返回所有图片文件的基本信息（文件名、大小等）
 */
router.get('/system', async (req, res) => {
  try {
    // 检查目录是否存在
    try {
      await fs.access(SYSTEM_AVATARS_PATH);
    } catch (error) {
      return res.status(404).json({
        status: 'error',
        message: '系统头像目录不存在',
        path: SYSTEM_AVATARS_PATH
      });
    }

    // 读取目录中的所有文件
    const files = await fs.readdir(SYSTEM_AVATARS_PATH);
    
    // 过滤出PNG文件
    const pngFiles = files.filter(file => 
      file.toLowerCase().endsWith('.png')
    );

    // 构建文件信息列表
    const avatars = [];
    
    for (const filename of pngFiles) {
      try {
        const filePath = path.join(SYSTEM_AVATARS_PATH, filename);
        
        // 检查文件是否存在
        if (!fsSync.existsSync(filePath)) {
          console.error(`文件不存在: ${filename}`);
          continue;
        }

        // 获取文件信息
        const stats = fsSync.statSync(filePath);
        
        avatars.push({
          filename: filename,
          name: path.parse(filename).name,
          size: stats.size,
          type: 'system',
          mimeType: 'image/png',
          url: `/api/userAvatar/system/${filename}`
        });

      } catch (fileError) {
        console.error(`处理文件 ${filename} 失败:`, fileError);
        // 继续处理其他文件，不中断整个过程
      }
    }

    res.json({
      status: 'success',
      message: '系统头像列表获取成功',
      data: {
        avatars: avatars,
        total: avatars.length,
        directory: 'system'
      }
    });

  } catch (error) {
    console.error('获取系统头像列表失败:', error);
    res.status(500).json({
      status: 'error',
      message: '获取系统头像列表失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
});

/**
 * 获取系统头像文件
 * GET /api/userAvatar/system/:filename
 * 返回指定文件名的图片文件
 */
router.get('/system/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    // 验证文件名格式
    if (!filename || !filename.toLowerCase().endsWith('.png')) {
      return res.status(400).json({
        status: 'error',
        message: '文件名不能为空，且只支持PNG文件'
      });
    }

    const filePath = path.join(SYSTEM_AVATARS_PATH, filename);

    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        status: 'error',
        message: '头像文件不存在',
        filename: filename
      });
    }

    // 获取文件信息
    const stats = fsSync.statSync(filePath);

    // 设置响应头
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    // 创建文件读取流并管道传输
    const fileStream = fsSync.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
      console.error(`读取文件 ${filename} 失败:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          status: 'error',
          message: '读取头像文件失败',
          error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
        });
      }
    });
    
    // 管道传输文件数据
    fileStream.pipe(res);

  } catch (error) {
    console.error('获取系统头像文件失败:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: '获取系统头像文件失败',
        error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
      });
    }
  }
});

// 获取用户头像数据
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByPk(userId);

    if (!user || !user.avatar_path) {
      return res.status(404).json({
        status: 'error',
        message: 'Avatar not found'
      });
    }

    // 读取头像为 dataURL
    let avatar_data_url = null;
    try {
      const absoluteAvatarDir = path.join(dataPath, user.avatar_path);
      const avatarFile = path.join(absoluteAvatarDir, 'Avatar.png');
      if (fsSync.existsSync(avatarFile)) {
        const buf = fsSync.readFileSync(avatarFile);
        const b64 = buf.toString('base64');
        avatar_data_url = `data:image/png;base64,${b64}`;
      }
    } catch (e) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to read avatar file'
      });
    }

    res.json({
      status: 'success',
      message: 'Avatar retrieved successfully',
      avatar_data_url
    });

  } catch (error) {
    console.error('Get avatar failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve avatar',
      error: error.message
    });
  }
});

// 上传用户头像
router.post('/', authenticateToken, (req, res, next) => {
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
          message: '文件大小不能超过 20MB'
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

    // 查找用户
    const user = await User.findByPk(req.user.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: '用户不存在'
      });
    }

    // 验证文件大小（20MB 限制）
    if (req.file.size > 20 * 1024 * 1024) {
      return res.status(400).json({
        status: 'error',
        message: '头像文件大小不能超过 20MB'
      });
    }

    // 验证文件类型
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        status: 'error',
        message: '只允许上传图片文件'
      });
    }

    // 创建用户头像目录
    const relativeAvatarDir = path.join('user', String(user.id), 'avatar');
    const absoluteAvatarDir = path.join(dataPath, relativeAvatarDir);
    
    // 确保目录存在
    if (!fsSync.existsSync(absoluteAvatarDir)) {
      fsSync.mkdirSync(absoluteAvatarDir, { recursive: true });
    }

    // 保存头像文件（统一保存为 Avatar.png）
    const avatarFileName = 'Avatar.png';
    const avatarFilePath = path.join(absoluteAvatarDir, avatarFileName);
    
    // 处理裁剪参数
    const cropParams = {
      xPct: parseFloat(req.body.xPct) || 0,
      yPct: parseFloat(req.body.yPct) || 0,
      wPct: parseFloat(req.body.wPct) || 1,
      hPct: parseFloat(req.body.hPct) || 1
    };

    // 使用 sharp 处理图片：裁剪、调整尺寸、转换格式
    try {
      const image = sharp(req.file.buffer);
      
      // 获取原图尺寸
      const metadata = await image.metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      // 计算裁剪区域（像素值）
      const cropArea = {
        left: Math.round(originalWidth * cropParams.xPct),
        top: Math.round(originalHeight * cropParams.yPct),
        width: Math.round(originalWidth * cropParams.wPct),
        height: Math.round(originalHeight * cropParams.hPct)
      };

      // 裁剪、调整尺寸并保存为PNG
      await image
        .extract(cropArea)
        .resize(720, 720, {
          fit: 'cover',
          position: 'center'
        })
        .png({ quality: 90 })
        .toFile(avatarFilePath);
      
      console.log('头像处理并保存成功:', avatarFilePath);
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
    const convertedFileStats = fsSync.statSync(avatarFilePath);
    
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

// 设置系统头像
router.post('/system/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // 验证文件名格式
    if (!filename || !filename.toLowerCase().endsWith('.png')) {
      return res.status(400).json({
        status: 'error',
        message: '文件名不能为空，且只支持PNG文件'
      });
    }

    // 检查用户是否存在
    const user = await User.findByPk(req.user.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: '用户不存在'
      });
    }

    // 验证系统头像文件是否存在
    const systemAvatarPath = path.join(SYSTEM_AVATARS_PATH, filename);
    try {
      await fs.access(systemAvatarPath);
    } catch (error) {
      return res.status(404).json({
        status: 'error',
        message: '系统头像文件不存在',
        filename: filename
      });
    }

    // 创建用户头像目录
    const relativeAvatarDir = path.join('user', String(user.id), 'avatar');
    const absoluteAvatarDir = path.join(dataPath, relativeAvatarDir);
    
    // 确保目录存在
    if (!fsSync.existsSync(absoluteAvatarDir)) {
      fsSync.mkdirSync(absoluteAvatarDir, { recursive: true });
    }

    // 目标文件路径
    const avatarFileName = 'Avatar.png';
    const avatarFilePath = path.join(absoluteAvatarDir, avatarFileName);

    // 复制系统头像到用户头像目录
    await fs.copyFile(systemAvatarPath, avatarFilePath);

    // 更新数据库中的头像路径
    await user.update({ avatar_path: relativeAvatarDir });

    // 获取文件信息
    const fileStats = fsSync.statSync(avatarFilePath);
    const imageInfo = await sharp(avatarFilePath).metadata();

    res.json({
      status: 'success',
      message: '系统头像设置成功',
      avatar_path: relativeAvatarDir,
      file_info: {
        filename: filename,
        size: fileStats.size,
        format: 'PNG',
        dimensions: `${imageInfo.width}x${imageInfo.height}`
      }
    });

  } catch (error) {
    console.error('设置系统头像失败:', error);
    res.status(500).json({
      status: 'error',
      message: '设置系统头像失败',
      error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
    });
  }
});

module.exports = router;
