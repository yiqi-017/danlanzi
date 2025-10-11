const fs = require('fs');
const path = require('path');

// 创建迁移文件目录
const migrationsDir = path.join(__dirname, '../src/migrations');
if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

// 迁移文件模板
const migrationTemplate = (tableName, upSQL, downSQL) => `
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(\`${upSQL}\`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(\`${downSQL}\`);
  }
};
`;

// 所有表的创建SQL
const tables = [
  {
    name: 'users',
    up: `CREATE TABLE users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255),
      nickname VARCHAR(100) NOT NULL,
      avatar_url VARCHAR(255),
      role ENUM('user', 'admin') DEFAULT 'user',
      status ENUM('active', 'banned', 'deleted') DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email),
      INDEX idx_status (status),
      INDEX idx_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS users;'
  },
  {
    name: 'courses',
    up: `CREATE TABLE courses (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      dept VARCHAR(100),
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_code (code),
      INDEX idx_dept (dept),
      INDEX idx_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS courses;'
  },
  {
    name: 'course_offerings',
    up: `CREATE TABLE course_offerings (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      course_id BIGINT NOT NULL,
      term VARCHAR(50) NOT NULL,
      section VARCHAR(10),
      instructor VARCHAR(100),
      schedule_json JSON,
      extra_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      INDEX idx_course_id (course_id),
      INDEX idx_term (term),
      INDEX idx_instructor (instructor),
      UNIQUE KEY unique_offering (course_id, term, section)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS course_offerings;'
  },
  {
    name: 'enrollments',
    up: `CREATE TABLE enrollments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      offering_id BIGINT NOT NULL,
      status ENUM('enrolled', 'completed', 'dropped') DEFAULT 'enrolled',
      score DECIMAL(3,1),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_offering_id (offering_id),
      INDEX idx_status (status),
      UNIQUE KEY unique_enrollment (user_id, offering_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS enrollments;'
  },
  {
    name: 'resources',
    up: `CREATE TABLE resources (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      uploader_id BIGINT NOT NULL,
      type ENUM('file', 'link', 'note') NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      url_or_path VARCHAR(255),
      visibility ENUM('public', 'course', 'private') DEFAULT 'public',
      status ENUM('normal', 'blocked', 'deleted') DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_uploader_id (uploader_id),
      INDEX idx_type (type),
      INDEX idx_visibility (visibility),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS resources;'
  },
  {
    name: 'resource_course_links',
    up: `CREATE TABLE resource_course_links (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      resource_id BIGINT NOT NULL,
      course_id BIGINT,
      offering_id BIGINT,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE,
      INDEX idx_resource_id (resource_id),
      INDEX idx_course_id (course_id),
      INDEX idx_offering_id (offering_id),
      UNIQUE KEY unique_link (resource_id, course_id, offering_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS resource_course_links;'
  },
  {
    name: 'resource_favorites',
    up: `CREATE TABLE resource_favorites (
      user_id BIGINT NOT NULL,
      resource_id BIGINT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, resource_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_resource_id (resource_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS resource_favorites;'
  },
  {
    name: 'resource_stats',
    up: `CREATE TABLE resource_stats (
      resource_id BIGINT PRIMARY KEY,
      view_count INT DEFAULT 0,
      download_count INT DEFAULT 0,
      favorite_count INT DEFAULT 0,
      like_count INT DEFAULT 0,
      report_count INT DEFAULT 0,
      last_interacted_at DATETIME,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
      INDEX idx_view_count (view_count),
      INDEX idx_download_count (download_count),
      INDEX idx_favorite_count (favorite_count),
      INDEX idx_like_count (like_count)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS resource_stats;'
  },
  {
    name: 'course_reviews',
    up: `CREATE TABLE course_reviews (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      author_id BIGINT NOT NULL,
      course_id BIGINT NOT NULL,
      offering_id BIGINT,
      rating_overall TINYINT,
      rating_difficulty TINYINT,
      rating_workload TINYINT,
      rating_teaching TINYINT,
      title VARCHAR(255),
      content TEXT,
      is_anonymous BOOLEAN DEFAULT FALSE,
      status ENUM('normal', 'blocked', 'deleted') DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE,
      INDEX idx_author_id (author_id),
      INDEX idx_course_id (course_id),
      INDEX idx_offering_id (offering_id),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at),
      UNIQUE KEY unique_review (author_id, course_id, offering_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS course_reviews;'
  },
  {
    name: 'review_comments',
    up: `CREATE TABLE review_comments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      review_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      content TEXT NOT NULL,
      status ENUM('normal', 'blocked', 'deleted') DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (review_id) REFERENCES course_reviews(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_review_id (review_id),
      INDEX idx_user_id (user_id),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS review_comments;'
  },
  {
    name: 'notifications',
    up: `CREATE TABLE notifications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      type ENUM('system', 'resource', 'review', 'comment', 'announcement') NOT NULL,
      title VARCHAR(255),
      content TEXT,
      entity_type VARCHAR(50),
      entity_id BIGINT,
      is_read BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_type (type),
      INDEX idx_is_read (is_read),
      INDEX idx_created_at (created_at),
      INDEX idx_entity (entity_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS notifications;'
  },
  {
    name: 'announcements',
    up: `CREATE TABLE announcements (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT,
      priority INT DEFAULT 0,
      starts_at DATETIME,
      ends_at DATETIME,
      status ENUM('scheduled', 'active', 'ended') DEFAULT 'scheduled',
      created_by BIGINT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_status (status),
      INDEX idx_priority (priority),
      INDEX idx_starts_at (starts_at),
      INDEX idx_ends_at (ends_at),
      INDEX idx_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS announcements;'
  },
  {
    name: 'user_announcement_reads',
    up: `CREATE TABLE user_announcement_reads (
      announcement_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (announcement_id, user_id),
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_announcement_id (announcement_id),
      INDEX idx_user_id (user_id),
      INDEX idx_read_at (read_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS user_announcement_reads;'
  },
  {
    name: 'reports',
    up: `CREATE TABLE reports (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      reporter_id BIGINT NOT NULL,
      entity_type ENUM('resource', 'review', 'comment') NOT NULL,
      entity_id BIGINT NOT NULL,
      reason ENUM('plagiarism', 'abuse', 'spam', 'other') NOT NULL,
      details TEXT,
      status ENUM('pending', 'handled') DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_reporter_id (reporter_id),
      INDEX idx_entity (entity_type, entity_id),
      INDEX idx_reason (reason),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS reports;'
  },
  {
    name: 'moderation_queue',
    up: `CREATE TABLE moderation_queue (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      entity_type ENUM('resource', 'review', 'comment') NOT NULL,
      entity_id BIGINT NOT NULL,
      report_count INT DEFAULT 0,
      status ENUM('pending', 'approved', 'rejected', 'removed') DEFAULT 'pending',
      handled_by BIGINT,
      handled_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_entity (entity_type, entity_id),
      INDEX idx_status (status),
      INDEX idx_report_count (report_count),
      INDEX idx_handled_by (handled_by),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS moderation_queue;'
  },
  {
    name: 'files',
    up: `CREATE TABLE files (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      uploader_id BIGINT NOT NULL,
      storage_provider VARCHAR(20) NOT NULL,
      bucket VARCHAR(100),
      object_key VARCHAR(255) NOT NULL,
      size BIGINT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      hash VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_uploader_id (uploader_id),
      INDEX idx_storage_provider (storage_provider),
      INDEX idx_mime_type (mime_type),
      INDEX idx_hash (hash),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
    down: 'DROP TABLE IF EXISTS files;'
  }
];

// 生成迁移文件
tables.forEach((table, index) => {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const filename = `${timestamp}${String(index + 1).padStart(2, '0')}-create-${table.name}.js`;
  const filepath = path.join(migrationsDir, filename);
  
  const content = migrationTemplate(table.name, table.up, table.down);
  fs.writeFileSync(filepath, content);
  console.log(`Created migration: ${filename}`);
});

console.log(`\n所有迁移文件已创建完成！`);
console.log(`迁移文件位置: ${migrationsDir}`);
console.log(`\n运行以下命令来执行迁移:`);
console.log(`npm run migrate`);
