'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`CREATE TABLE resource_comment_reactions (
      user_id BIGINT NOT NULL,
      comment_id BIGINT NOT NULL,
      reaction ENUM('like', 'dislike') NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, comment_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (comment_id) REFERENCES resource_comments(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_comment_id (comment_id),
      INDEX idx_reaction (reaction)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS resource_comment_reactions;`);
  }
};

