
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE resources (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS resources;`);
  }
};
