'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 新增 avatar_path 列，先允许为 NULL，避免历史数据立刻违规
    await queryInterface.sequelize.query(`
      ALTER TABLE users
      ADD COLUMN avatar_path VARCHAR(1024) NULL AFTER avatar_url;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users
      DROP COLUMN avatar_path;
    `);
  }
};


