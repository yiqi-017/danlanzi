'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 步骤1：先添加新的枚举值（保留旧的 'comment' 值）
    await queryInterface.sequelize.query(`
      ALTER TABLE reports 
      MODIFY COLUMN entity_type ENUM('resource', 'review', 'comment', 'resource_comment', 'review_comment') NOT NULL
    `);
    
    await queryInterface.sequelize.query(`
      ALTER TABLE moderation_queue 
      MODIFY COLUMN entity_type ENUM('resource', 'review', 'comment', 'resource_comment', 'review_comment') NOT NULL
    `);
    
    // 步骤2：迁移旧数据 - 将 'comment' 类型的数据迁移为具体类型
    // 对于 reports 表，检查评论是否存在于 review_comments 或 resource_comments
    await queryInterface.sequelize.query(`
      UPDATE reports r
      LEFT JOIN review_comments rc ON r.entity_id = rc.id AND r.entity_type = 'comment'
      LEFT JOIN resource_comments rsc ON r.entity_id = rsc.id AND r.entity_type = 'comment'
      SET r.entity_type = CASE
        WHEN rc.id IS NOT NULL THEN 'review_comment'
        WHEN rsc.id IS NOT NULL THEN 'resource_comment'
        ELSE r.entity_type
      END
      WHERE r.entity_type = 'comment'
    `);
    
    // 对于 moderation_queue 表
    await queryInterface.sequelize.query(`
      UPDATE moderation_queue mq
      LEFT JOIN review_comments rc ON mq.entity_id = rc.id AND mq.entity_type = 'comment'
      LEFT JOIN resource_comments rsc ON mq.entity_id = rsc.id AND mq.entity_type = 'comment'
      SET mq.entity_type = CASE
        WHEN rc.id IS NOT NULL THEN 'review_comment'
        WHEN rsc.id IS NOT NULL THEN 'resource_comment'
        ELSE mq.entity_type
      END
      WHERE mq.entity_type = 'comment'
    `);
    
    // 步骤3：移除旧的 'comment' 枚举值
    await queryInterface.sequelize.query(`
      ALTER TABLE reports 
      MODIFY COLUMN entity_type ENUM('resource', 'review', 'resource_comment', 'review_comment') NOT NULL
    `);
    
    await queryInterface.sequelize.query(`
      ALTER TABLE moderation_queue 
      MODIFY COLUMN entity_type ENUM('resource', 'review', 'resource_comment', 'review_comment') NOT NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    // 回滚：将 resource_comment 和 review_comment 改回 comment
    await queryInterface.sequelize.query(`
      UPDATE reports 
      SET entity_type = 'comment' 
      WHERE entity_type IN ('resource_comment', 'review_comment')
    `);
    
    await queryInterface.sequelize.query(`
      UPDATE moderation_queue 
      SET entity_type = 'comment' 
      WHERE entity_type IN ('resource_comment', 'review_comment')
    `);
    
    // 恢复旧的 ENUM 定义
    await queryInterface.sequelize.query(`
      ALTER TABLE reports 
      MODIFY COLUMN entity_type ENUM('resource', 'review', 'comment') NOT NULL
    `);
    
    await queryInterface.sequelize.query(`
      ALTER TABLE moderation_queue 
      MODIFY COLUMN entity_type ENUM('resource', 'review', 'comment') NOT NULL
    `);
  }
};

