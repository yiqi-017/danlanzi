'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 修改 moderation_queue 表的 status 列，添加 'pending_review' 枚举值
    await queryInterface.sequelize.query(`
      ALTER TABLE moderation_queue 
      MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'removed', 'pending_review') DEFAULT 'pending'
    `);
  },

  async down(queryInterface, Sequelize) {
    // 回滚：移除 'pending_review' 枚举值
    // 注意：如果有记录使用了 'pending_review' 状态，这个回滚会失败
    await queryInterface.sequelize.query(`
      ALTER TABLE moderation_queue 
      MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'removed') DEFAULT 'pending'
    `);
  }
};
