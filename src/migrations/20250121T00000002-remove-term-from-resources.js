'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查字段是否存在，如果存在则删除
    const tableDescription = await queryInterface.describeTable('resources');
    
    if (tableDescription.term) {
      // 删除索引（如果存在）
      try {
        await queryInterface.removeIndex('resources', 'idx_term');
      } catch (error) {
        // 索引可能不存在，忽略错误
        console.log('Index idx_term may not exist, skipping...');
      }
      
      // 删除字段
      await queryInterface.removeColumn('resources', 'term');
    }
  },

  async down(queryInterface, Sequelize) {
    // 回滚：重新添加 term 字段
    const tableDescription = await queryInterface.describeTable('resources');
    
    if (!tableDescription.term) {
      await queryInterface.addColumn('resources', 'term', {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: '开课学期'
      });
      
      // 添加索引
      await queryInterface.addIndex('resources', ['term'], {
        name: 'idx_term'
      });
    }
  }
};

