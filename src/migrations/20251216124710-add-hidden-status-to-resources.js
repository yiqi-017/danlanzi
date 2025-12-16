'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 修改 resources 表的 status 字段，添加 'hidden' 值
    await queryInterface.sequelize.query(`
      ALTER TABLE resources 
      MODIFY COLUMN status ENUM('normal', 'blocked', 'deleted', 'hidden') DEFAULT 'normal';
    `);
  },

  async down(queryInterface, Sequelize) {
    // 回滚：移除 'hidden' 值，将 hidden 状态的资源改为 normal
    await queryInterface.sequelize.query(`
      UPDATE resources SET status = 'normal' WHERE status = 'hidden';
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE resources 
      MODIFY COLUMN status ENUM('normal', 'blocked', 'deleted') DEFAULT 'normal';
    `);
  }
};
