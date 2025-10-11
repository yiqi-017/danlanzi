const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { sequelize } = require('./models');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(helmet());
app.use(cors());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: '请求过于频繁，请稍后再试'
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 路由
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '旦篮子后端服务运行正常',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/db-test', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'success',
      message: '数据库连接成功',
      database: sequelize.getDatabaseName()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: '数据库连接失败',
      error: error.message
    });
  }
});

app.get('/tables', async (req, res) => {
  try {
    const [results] = await sequelize.query('SHOW TABLES');
    const tables = results.map(row => Object.values(row)[0]);
    
    res.json({
      status: 'success',
      message: '获取表信息成功',
      tables: tables,
      count: tables.length
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: '获取表信息失败',
      error: error.message
    });
  }
});

// 错误处理
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: '接口不存在',
    path: req.originalUrl
  });
});

app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({
    status: 'error',
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? error.message : '请稍后重试'
  });
});

// 启动服务
async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');
    
    app.listen(PORT, () => {
      console.log(`旦篮子后端服务已启动`);
      console.log(`服务地址: http://localhost:${PORT}`);
      console.log(`健康检查: http://localhost:${PORT}/health`);
      console.log(`数据库测试: http://localhost:${PORT}/db-test`);
      console.log(`表信息查看: http://localhost:${PORT}/tables`);
    });
  } catch (error) {
    console.error('启动失败:', error.message);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  await sequelize.close();
  console.log('数据库连接已关闭');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n正在关闭服务器...');
  await sequelize.close();
  console.log('数据库连接已关闭');
  process.exit(0);
});

startServer();
