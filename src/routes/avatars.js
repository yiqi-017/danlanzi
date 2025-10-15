const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { Readable } = require('stream');
const router = express.Router();

// 系统头像目录路径
const SYSTEM_AVATARS_PATH = path.join(__dirname, '../../../dlz-database/system/avatars');

/**
 * 获取系统头像文件列表
 * GET /api/avatars/system
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
          url: `/api/avatars/system/${filename}`
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
 * GET /api/avatars/system/:filename
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

module.exports = router;
