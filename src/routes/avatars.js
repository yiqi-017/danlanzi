const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { Readable } = require('stream');
const router = express.Router();

// 系统头像目录路径
const SYSTEM_AVATARS_PATH = path.join(__dirname, '../../../dlz-database/system/avatars');

/**
 * 获取系统头像列表和文件数据（流式传输）
 * GET /api/avatars/system
 * 使用流式传输返回所有PNG文件的文件名和对应的二进制数据
 * 使用multipart格式，便于在Postman中查看
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
    
    // 过滤出图片文件（支持常见图片格式）
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    // 设置multipart响应头
    const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substr(2);
    res.setHeader('Content-Type', `multipart/mixed; boundary=${boundary}`);
    res.setHeader('Transfer-Encoding', 'chunked');

    // 发送头部信息
    const headerInfo = {
      status: 'success',
      message: '系统头像列表和文件数据获取成功',
      total: imageFiles.length,
      type: 'system_avatars',
      directory: 'system'
    };
    
    res.write(`--${boundary}\r\n`);
    res.write('Content-Type: application/json\r\n');
    res.write('Content-Disposition: inline; name="header"\r\n\r\n');
    res.write(JSON.stringify(headerInfo, null, 2));
    res.write('\r\n');

    // 处理每个图片文件
    for (const filename of imageFiles) {
      try {
        const filePath = path.join(SYSTEM_AVATARS_PATH, filename);
        
        // 检查文件是否存在
        if (!fsSync.existsSync(filePath)) {
          console.error(`文件不存在: ${filename}`);
          continue;
        }

        // 获取文件信息
        const stats = fsSync.statSync(filePath);
        
        // 发送文件元数据
        const fileInfo = {
          filename: filename,
          name: path.parse(filename).name,
          size: stats.size,
          type: 'system'
        };
        
        res.write(`--${boundary}\r\n`);
        res.write('Content-Type: application/json\r\n');
        res.write(`Content-Disposition: inline; name="${filename}_info"\r\n\r\n`);
        res.write(JSON.stringify(fileInfo, null, 2));
        res.write('\r\n');
        
        // 获取文件扩展名并设置正确的Content-Type
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.webp': 'image/webp'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        // 发送文件数据
        res.write(`--${boundary}\r\n`);
        res.write(`Content-Type: ${contentType}\r\n`);
        res.write(`Content-Disposition: attachment; filename="${filename}"\r\n`);
        res.write(`Content-Length: ${stats.size}\r\n\r\n`);
        
        // 创建文件读取流并管道传输
        const fileStream = fsSync.createReadStream(filePath);
        
        await new Promise((resolve, reject) => {
          fileStream.on('error', (error) => {
            console.error(`读取文件 ${filename} 失败:`, error);
            reject(error);
          });
          
          fileStream.on('end', () => {
            res.write('\r\n');
            resolve();
          });
          
          // 管道传输文件数据
          fileStream.pipe(res, { end: false });
        });

      } catch (fileError) {
        console.error(`处理文件 ${filename} 失败:`, fileError);
        // 继续处理其他文件，不中断整个过程
      }
    }

    // 结束multipart响应
    res.write(`--${boundary}--\r\n`);
    res.end();

  } catch (error) {
    console.error('获取系统头像列表和文件数据失败:', error);
    
    // 如果还没有开始写入响应，发送错误响应
    if (!res.headersSent) {
      res.status(500).json({
        status: 'error',
        message: '获取系统头像列表和文件数据失败',
        error: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误'
      });
    } else {
      // 如果已经开始写入响应，只能关闭连接
      res.end();
    }
  }
});

module.exports = router;
