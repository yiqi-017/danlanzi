'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users
      DROP COLUMN avatar_url;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE users
      ADD COLUMN avatar_url VARCHAR(255) NULL AFTER nickname;
    `);
  }
};


