
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE resource_course_links (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS resource_course_links;`);
  }
};
