
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE enrollments (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS enrollments;`);
  }
};
