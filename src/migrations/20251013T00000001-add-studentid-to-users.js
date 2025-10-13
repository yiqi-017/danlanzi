'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1) 先新增可空列，避免立即触发非空约束
    await queryInterface.sequelize.query(`
      ALTER TABLE users
      ADD COLUMN student_id VARCHAR(255) NULL AFTER email;
    `);

    // 2) 用邮箱本地部分回填已有数据
    await queryInterface.sequelize.query(`
      UPDATE users
      SET student_id = SUBSTRING_INDEX(email, '@', 1)
      WHERE student_id IS NULL;
    `);

    // 3) 为 student_id 建唯一索引
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_student_id ON users (student_id);
    `);

    // 4) 将列改为非空
    await queryInterface.sequelize.query(`
      ALTER TABLE users
      MODIFY COLUMN student_id VARCHAR(255) NOT NULL;
    `);
  },

  async down(queryInterface, Sequelize) {
    // 回滚时删除索引与列
    await queryInterface.sequelize.query(`
      DROP INDEX idx_student_id ON users;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE users
      DROP COLUMN student_id;
    `);
  }
};


