'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查字段是否已存在
    const tableDescription = await queryInterface.describeTable('resources');
    
    if (!tableDescription.tags) {
      await queryInterface.addColumn('resources', 'tags', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '资源标签，JSON数组格式'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable('resources');
    
    if (tableDescription.tags) {
      await queryInterface.removeColumn('resources', 'tags');
    }
  }
};

