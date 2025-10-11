
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE resource_stats (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS resource_stats;`);
  }
};
