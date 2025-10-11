
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE course_offerings (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS course_offerings;`);
  }
};
