'use strict';

/**
 * 数据迁移：将评分从 1-5 分转换为 1-10 分
 * 
 * 转换规则：
 * 1分 -> 2分 (1 * 2)
 * 2分 -> 4分 (2 * 2)
 * 3分 -> 6分 (3 * 2)
 * 4分 -> 8分 (4 * 2)
 * 5分 -> 10分 (5 * 2)
 * 
 * 注意：这个迁移是可选的，只有在数据库中有 1-5 分的历史数据时才需要运行
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查是否有评分数据需要转换
    const [results] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count 
      FROM course_reviews 
      WHERE rating_overall IS NOT NULL 
        AND rating_overall BETWEEN 1 AND 5
    `);
    
    const count = results[0].count;
    
    if (count === 0) {
      console.log('没有需要迁移的评分数据，跳过迁移');
      return;
    }
    
    console.log(`找到 ${count} 条需要迁移的评分记录`);
    
    // 转换 rating_overall: 1-5 -> 2,4,6,8,10
    await queryInterface.sequelize.query(`
      UPDATE course_reviews 
      SET rating_overall = rating_overall * 2
      WHERE rating_overall IS NOT NULL 
        AND rating_overall BETWEEN 1 AND 5
    `);
    
    // 转换 rating_teaching: 1-5 -> 2,4,6,8,10
    await queryInterface.sequelize.query(`
      UPDATE course_reviews 
      SET rating_teaching = rating_teaching * 2
      WHERE rating_teaching IS NOT NULL 
        AND rating_teaching BETWEEN 1 AND 5
    `);
    
    // 转换 rating_difficulty: 1-5 -> 2,4,6,8,10
    await queryInterface.sequelize.query(`
      UPDATE course_reviews 
      SET rating_difficulty = rating_difficulty * 2
      WHERE rating_difficulty IS NOT NULL 
        AND rating_difficulty BETWEEN 1 AND 5
    `);
    
    // 转换 rating_workload: 1-5 -> 2,4,6,8,10
    await queryInterface.sequelize.query(`
      UPDATE course_reviews 
      SET rating_workload = rating_workload * 2
      WHERE rating_workload IS NOT NULL 
        AND rating_workload BETWEEN 1 AND 5
    `);
    
    console.log('评分数据迁移完成：所有 1-5 分已转换为 2,4,6,8,10 分');
  },

  async down(queryInterface, Sequelize) {
    // 回滚：将 2,4,6,8,10 分转换回 1,2,3,4,5 分
    console.log('回滚评分数据迁移...');
    
    // 回滚 rating_overall: 2,4,6,8,10 -> 1,2,3,4,5
    await queryInterface.sequelize.query(`
      UPDATE course_reviews 
      SET rating_overall = rating_overall / 2
      WHERE rating_overall IS NOT NULL 
        AND rating_overall IN (2, 4, 6, 8, 10)
    `);
    
    // 回滚 rating_teaching
    await queryInterface.sequelize.query(`
      UPDATE course_reviews 
      SET rating_teaching = rating_teaching / 2
      WHERE rating_teaching IS NOT NULL 
        AND rating_teaching IN (2, 4, 6, 8, 10)
    `);
    
    // 回滚 rating_difficulty
    await queryInterface.sequelize.query(`
      UPDATE course_reviews 
      SET rating_difficulty = rating_difficulty / 2
      WHERE rating_difficulty IS NOT NULL 
        AND rating_difficulty IN (2, 4, 6, 8, 10)
    `);
    
    // 回滚 rating_workload
    await queryInterface.sequelize.query(`
      UPDATE course_reviews 
      SET rating_workload = rating_workload / 2
      WHERE rating_workload IS NOT NULL 
        AND rating_workload IN (2, 4, 6, 8, 10)
    `);
    
    console.log('评分数据回滚完成');
  }
};

