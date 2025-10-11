const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
  const databaseName = process.env.DB_NAME || 'dlz_backend';
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    console.log('正在初始化数据库...');
    
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`数据库 '${databaseName}' 创建成功`);
    
    await connection.end();
    
    const dbConnection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: databaseName
    });
    
    console.log(`已连接到数据库 '${databaseName}'`);
    console.log(`当前数据库: ${databaseName}`);
    
    await dbConnection.end();
    
    console.log('\n数据库初始化完成！');
    console.log('\n下一步操作:');
    console.log('1. 运行数据库迁移: npm run migrate');
    console.log('2. 启动应用服务: npm run dev');
    console.log('3. 访问健康检查: http://localhost:3001/health');
    
  } catch (error) {
    console.error('数据库初始化失败:', error.message);
    process.exit(1);
  }
}

function checkEnvVars() {
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.log('以下环境变量未设置，将使用默认值:');
    missing.forEach(key => {
      console.log(`   - ${key}`);
    });
    console.log('\n建议创建 .env 文件并设置这些变量');
  }
}

console.log('旦篮子数据库初始化工具');
console.log('================================\n');

checkEnvVars();
initDatabase();