
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE moderation_queue (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS moderation_queue;`);
  }
};
