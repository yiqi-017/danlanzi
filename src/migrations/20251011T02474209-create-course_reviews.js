
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE course_reviews (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS course_reviews;`);
  }
};
