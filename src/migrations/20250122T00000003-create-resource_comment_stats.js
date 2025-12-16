'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE resource_comment_stats (
      comment_id BIGINT PRIMARY KEY,
      like_count INT DEFAULT 0,
      dislike_count INT DEFAULT 0,
      net_score INT DEFAULT 0,
      last_reacted_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (comment_id) REFERENCES resource_comments(id) ON DELETE CASCADE,
      INDEX idx_like_count (like_count),
      INDEX idx_dislike_count (dislike_count),
      INDEX idx_net_score (net_score)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS resource_comment_stats;`);
  }
};

