# 表

## 用户系统

### **users — 用户表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 用户唯一 ID |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 登录邮箱 |
| password_hash | VARCHAR(255) | 可空 | 密码哈希（或空，用于统一认证登录） |
| nickname | VARCHAR(100) | NOT NULL | 用户昵称 |
| avatar_url | VARCHAR(255) |  | 头像链接 |
| role | ENUM('user','admin') | DEFAULT 'user' | 用户角色（普通用户/系统管理员） |
| status | ENUM('active','banned','deleted') | DEFAULT 'active' | 账号状态 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

---

## 课程模块

### **courses — 课程目录**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 课程 ID |
| code | VARCHAR(50) | UNIQUE | 课程编号（如 CS101） |
| name | VARCHAR(255) | NOT NULL | 课程名称 |
| dept | VARCHAR(100) |  | 所属院系 |
| description | TEXT |  | 课程简介 |
| created_at | DATETIME |  | 创建时间 |
| updated_at | DATETIME |  | 更新时间 |

---

### **course_offerings — 开课实例**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 实例 ID |
| course_id | BIGINT | FK→courses.id | 所属课程 |
| term | VARCHAR(50) | NOT NULL | 学期（例：2025春） |
| section | VARCHAR(10) |  | 班号 |
| instructor | VARCHAR(100) |  | 授课教师 |
| schedule_json | JSON |  | 上课时间表 |
| extra_info | TEXT |  | 额外信息 |
| created_at | DATETIME |  | 创建时间 |

---

### **enrollments — 我的课程（选课）**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 选课 ID |
| user_id | BIGINT | FK→users.id | 用户 ID |
| offering_id | BIGINT | FK→course_offerings.id | 开课实例 |
| status | ENUM('enrolled','completed','dropped') | DEFAULT 'enrolled' | 状态 |
| score | DECIMAL(3,1) |  | 成绩 |
| created_at | DATETIME |  | 选课时间 |

---

## 课程资源模块

### **resources — 课程资源表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 资源 ID |
| uploader_id | BIGINT | FK→users.id | 上传者 |
| type | ENUM('file','link','note') | NOT NULL | 资源类型 |
| title | VARCHAR(255) | NOT NULL | 资源标题 |
| description | TEXT |  | 资源简介 |
| url_or_path | VARCHAR(255) |  | 文件路径或链接 |
| visibility | ENUM('public','course','private') | DEFAULT 'public' | 可见性 |
| status | ENUM('normal','blocked','deleted') | DEFAULT 'normal' | 状态 |
| created_at | DATETIME |  | 创建时间 |
| updated_at | DATETIME |  | 更新时间 |

---

### **resource_course_links — 资源与课程关联表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 关联 ID |
| resource_id | BIGINT | FK→resources.id | 资源 ID |
| course_id | BIGINT | FK→courses.id | 课程目录 ID |
| offering_id | BIGINT | FK→course_offerings.id | 开课实例 ID |

---

### **resource_favorites — 用户收藏资源表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| user_id | BIGINT | FK→users.id | 用户 ID |
| resource_id | BIGINT | FK→resources.id | 资源 ID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 收藏时间 |
| **主键** | (`user_id`,`resource_id`) |  | 复合主键 |

---

### **resource_stats — 资源统计信息**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| resource_id | BIGINT | PK→resources.id | 资源 ID |
| view_count | INT | DEFAULT 0 | 浏览次数 |
| download_count | INT | DEFAULT 0 | 下载次数 |
| favorite_count | INT | DEFAULT 0 | 收藏数 |
| like_count | INT | DEFAULT 0 | 点赞数 |
| report_count | INT | DEFAULT 0 | 举报数 |
| last_interacted_at | DATETIME |  | 最后互动时间 |

---

## 课程评价模块

### **course_reviews — 课程评价表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 评价 ID |
| author_id | BIGINT | FK→users.id | 作者 ID |
| course_id | BIGINT | FK→courses.id | 课程 ID |
| offering_id | BIGINT | FK→course_offerings.id | 可空 |
| rating_overall | TINYINT |  | 综合评分 |
| rating_difficulty | TINYINT |  | 难度评分 |
| rating_workload | TINYINT |  | 工作量评分 |
| rating_teaching | TINYINT |  | 教学质量评分 |
| title | VARCHAR(255) |  | 评价标题 |
| content | TEXT |  | 评价内容 |
| is_anonymous | BOOL | DEFAULT FALSE | 是否匿名 |
| status | ENUM('normal','blocked','deleted') | DEFAULT 'normal' | 状态 |
| created_at | DATETIME |  | 创建时间 |

---

### **review_comments — 课程评价评论**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 评论 ID |
| review_id | BIGINT | FK→course_reviews.id | 关联评价 |
| user_id | BIGINT | FK→users.id | 评论者 |
| content | TEXT |  | 评论内容 |
| status | ENUM('normal','blocked','deleted') | DEFAULT 'normal' | 状态 |
| created_at | DATETIME |  | 创建时间 |

---

## 通知与公告模块

### **notifications — 用户通知表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 通知 ID |
| user_id | BIGINT | FK→users.id | 接收者 |
| type | ENUM('system','resource','review','comment','announcement') |  | 通知类型 |
| title | VARCHAR(255) |  | 标题 |
| content | TEXT |  | 通知内容 |
| entity_type | VARCHAR(50) |  | 关联实体类型 |
| entity_id | BIGINT |  | 关联实体 ID |
| is_read | BOOL | DEFAULT FALSE | 是否已读 |
| created_at | DATETIME |  | 创建时间 |

---

### **announcements — 系统公告表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 公告 ID |
| title | VARCHAR(255) | NOT NULL | 公告标题 |
| content | TEXT |  | 公告内容 |
| priority | INT | DEFAULT 0 | 优先级 |
| starts_at | DATETIME |  | 生效时间 |
| ends_at | DATETIME |  | 结束时间 |
| status | ENUM('scheduled','active','ended') | DEFAULT 'scheduled' | 状态 |
| created_by | BIGINT | FK→users.id | 创建者（管理员） |

---

### **user_announcement_reads — 公告阅读记录表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| announcement_id | BIGINT | FK→announcements.id | 公告 ID |
| user_id | BIGINT | FK→users.id | 用户 ID |
| read_at | DATETIME |  | 阅读时间 |
| **主键** | (`announcement_id`,`user_id`) |  | 复合主键 |

---

## 管理与举报模块

### **reports — 举报记录表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 举报 ID |
| reporter_id | BIGINT | FK→users.id | 举报者 |
| entity_type | ENUM('resource','review','comment') |  | 举报对象类型 |
| entity_id | BIGINT |  | 对象 ID |
| reason | ENUM('plagiarism','abuse','spam','other') |  | 举报原因 |
| details | TEXT |  | 详细说明 |
| created_at | DATETIME |  | 创建时间 |
| status | ENUM('pending','handled') | DEFAULT 'pending' | 状态 |

---

### **moderation_queue — 审核队列表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 审核 ID |
| entity_type | ENUM('resource','review','comment') |  | 实体类型 |
| entity_id | BIGINT |  | 实体 ID |
| report_count | INT | DEFAULT 0 | 举报次数 |
| status | ENUM('pending','approved','rejected','removed') | DEFAULT 'pending' | 状态 |
| handled_by | BIGINT | FK→users.id | 审核管理员 |
| handled_at | DATETIME |  | 审核时间 |
| notes | TEXT |  | 备注 |

---

## 文件模块

### **files — 文件存储表**
| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | BIGINT | PK | 文件 ID |
| uploader_id | BIGINT | FK→users.id | 上传者 |
| storage_provider | VARCHAR(20) |  | 存储类型（OSS/S3/local） |
| bucket | VARCHAR(100) |  | 存储桶 |
| object_key | VARCHAR(255) |  | 对象路径 |
| size | BIGINT |  | 文件大小（字节） |
| mime_type | VARCHAR(100) |  | 文件类型 |
| hash | VARCHAR(255) |  | 哈希校验 |
| created_at | DATETIME |  | 上传时间 |

---

# 模块

| 模块 | 表名 | 功能 |
|------|------|------|
| 用户系统 | users, user_profiles | 用户与权限管理 |
| 课程 | courses, course_offerings, enrollments | 课程与选课 |
| 资源 | resources, resource_course_links, resource_favorites | 资源上传与收藏 |
| 课程评价 | course_reviews, review_comments | 课程体验与评论 |
| 通知公告 | notifications, announcements, user_announcement_reads | 用户通知与系统公告 |
| 审核与举报 | reports, moderation_queue | 内容治理 |
| 文件 | files | 文件存储 |

---