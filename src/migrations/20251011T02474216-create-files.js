
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE files (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS files;`);
  }
};
