'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查并添加用户资料字段
    const tableDescription = await queryInterface.describeTable('users');
    
    if (!tableDescription.department) {
      await queryInterface.addColumn('users', 'department', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }
    
    if (!tableDescription.major) {
      await queryInterface.addColumn('users', 'major', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }
    
    if (!tableDescription.bio) {
      await queryInterface.addColumn('users', 'bio', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
    
    if (!tableDescription.security_email) {
      await queryInterface.addColumn('users', 'security_email', {
        type: Sequelize.STRING(255),
        allowNull: true,
        validate: {
          isEmail: true
        }
      });
    }
    
    if (!tableDescription.theme) {
      await queryInterface.addColumn('users', 'theme', {
        type: Sequelize.ENUM('light', 'dark', 'auto'),
        defaultValue: 'dark'
      });
    }
    
    if (!tableDescription.language) {
      await queryInterface.addColumn('users', 'language', {
        type: Sequelize.ENUM('zh-CN', 'en-US'),
        defaultValue: 'zh-CN'
      });
    }
    
    if (!tableDescription.unified_auth_password) {
      await queryInterface.addColumn('users', 'unified_auth_password', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
    }

    // 添加隐私控制字段
    if (!tableDescription.show_student_id) {
      await queryInterface.addColumn('users', 'show_student_id', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      });
    }
    
    if (!tableDescription.show_department) {
      await queryInterface.addColumn('users', 'show_department', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      });
    }
    
    if (!tableDescription.show_major) {
      await queryInterface.addColumn('users', 'show_major', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      });
    }
    
    if (!tableDescription.show_bio) {
      await queryInterface.addColumn('users', 'show_bio', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      });
    }

    // 添加索引
    try {
      await queryInterface.addIndex('users', ['security_email'], {
        name: 'idx_security_email'
      });
    } catch (error) {
      // 索引可能已存在，忽略错误
    }
    
    try {
      await queryInterface.addIndex('users', ['department'], {
        name: 'idx_department'
      });
    } catch (error) {
      // 索引可能已存在，忽略错误
    }
    
    try {
      await queryInterface.addIndex('users', ['major'], {
        name: 'idx_major'
      });
    } catch (error) {
      // 索引可能已存在，忽略错误
    }
  },

  async down(queryInterface, Sequelize) {
    // 删除索引
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_security_email ON users;
      DROP INDEX IF EXISTS idx_department ON users;
      DROP INDEX IF EXISTS idx_major ON users;
    `);

    // 删除隐私控制字段
    await queryInterface.sequelize.query(`
      ALTER TABLE users
      DROP COLUMN show_bio,
      DROP COLUMN show_major,
      DROP COLUMN show_department,
      DROP COLUMN show_student_id;
    `);

    // 删除用户资料字段
    await queryInterface.sequelize.query(`
      ALTER TABLE users
      DROP COLUMN unified_auth_password,
      DROP COLUMN language,
      DROP COLUMN theme,
      DROP COLUMN security_email,
      DROP COLUMN bio,
      DROP COLUMN major,
      DROP COLUMN department;
    `);
  }
};
