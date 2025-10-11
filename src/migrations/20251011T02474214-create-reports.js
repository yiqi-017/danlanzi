
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE reports (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS reports;`);
  }
};
