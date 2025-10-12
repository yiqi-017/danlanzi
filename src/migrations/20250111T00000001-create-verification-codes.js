'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('verification_codes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: '邮箱地址'
      },
      code: {
        type: Sequelize.STRING(6),
        allowNull: false,
        comment: '验证码'
      },
      type: {
        type: Sequelize.ENUM('email_verification', 'password_reset', 'login'),
        allowNull: false,
        defaultValue: 'email_verification',
        comment: '验证码类型'
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: '过期时间'
      },
      isUsed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已使用'
      },
      usedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '使用时间'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // 添加索引
    await queryInterface.addIndex('verification_codes', ['email', 'type']);
    await queryInterface.addIndex('verification_codes', ['expiresAt']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('verification_codes');
  }
};
