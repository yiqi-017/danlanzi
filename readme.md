# 旦篮子后端

## 功能特性

- **用户系统**: 用户注册、登录、权限管理
- **课程管理**: 课程目录、开课实例、选课管理
- **资源共享**: 文件上传、链接分享、笔记发布
- **课程评价**: 课程评分、评价评论、匿名评价
- **通知系统**: 用户通知、系统公告
- **内容审核**: 举报管理、审核队列
- **文件存储**: 多存储提供商支持

## 系统要求

- Node.js >= 16.0.0
- MySQL >= 8.0
- npm >= 8.0.0

## 安装与配置

### 1. 克隆项目
```bash
git clone <repository-url>
cd dlz-backend
```

### 2. 安装依赖
```bash
npm install
```

### 3. 环境配置
修改env中的内容
```
编辑 `.env` 文件，配置数据库连接等信息：
```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=dlz_backend
DB_USER=root
DB_PASSWORD=your_password

# JWT配置
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# 服务器配置
PORT=3000
NODE_ENV=development

# 邮箱配置
EMAIL_USER=your gmail address
EMAIL_PASS=your gmail password
```

### 4. 数据库初始化
```bash
# 初始化数据库（创建空数据库）
npm run init-db

# 运行数据库迁移
npm run migrate
```

### 5. 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## 数据库表结构

### 核心表
- **users**: 用户信息表
- **courses**: 课程目录表
- **course_offerings**: 开课实例表
- **enrollments**: 选课记录表

### 资源相关表
- **resources**: 资源信息表
- **resource_course_links**: 资源课程关联表
- **resource_favorites**: 资源收藏表
- **resource_stats**: 资源统计表

### 评价相关表
- **course_reviews**: 课程评价表
- **review_comments**: 评价评论表

### 通知相关表
- **notifications**: 用户通知表
- **announcements**: 系统公告表
- **user_announcement_reads**: 公告阅读记录表

### 管理相关表
- **reports**: 举报记录表
- **moderation_queue**: 审核队列表
- **files**: 文件存储表

## 🔧 API接口

### 健康检查
- `GET /health` - 服务健康状态
- `GET /db-test` - 数据库连接测试
- `GET /tables` - 获取所有表信息

## 项目结构

```
dlz-backend/
├── config/                # 链接数据库
│   └── database.js        # 数据库配置
├── src/
│   ├── models/            # 数据模型
│   │   ├── User.js
│   │   ├── Course.js
│   │   ├── Resource.js
│   │   └── ...
│   ├── migrations/        # 数据库迁移文件
│   ├── config/            # sequelize CLI配置
│   └── app.js             # 应用入口
├── scripts/               # 脚本文件
├── package.json
├── .sequelizerc
└── README.md
```
