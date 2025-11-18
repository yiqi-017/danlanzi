'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 先删除旧的instructor索引（必须在修改字段类型之前）
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE course_offerings 
        DROP INDEX idx_instructor
      `);
    } catch (error) {
      // 如果索引不存在，忽略错误
      console.log('Index idx_instructor may not exist, continuing...');
    }

    // 将instructor字段从VARCHAR改为JSON
    // 首先需要处理现有数据：将字符串转换为JSON数组
    await queryInterface.sequelize.query(`
      UPDATE course_offerings 
      SET instructor = CASE 
        WHEN instructor IS NULL OR instructor = '' THEN NULL
        ELSE JSON_ARRAY(instructor)
      END
      WHERE instructor IS NOT NULL AND instructor != ''
    `);

    // 修改字段类型为JSON
    await queryInterface.sequelize.query(`
      ALTER TABLE course_offerings 
      MODIFY COLUMN instructor JSON
    `);
  },

  async down(queryInterface, Sequelize) {
    // 恢复instructor字段为VARCHAR
    // 首先将JSON数组转换为字符串（取第一个元素）
    await queryInterface.sequelize.query(`
      UPDATE course_offerings 
      SET instructor = CASE 
        WHEN instructor IS NULL THEN NULL
        WHEN JSON_TYPE(instructor) = 'ARRAY' AND JSON_LENGTH(instructor) > 0 THEN JSON_UNQUOTE(JSON_EXTRACT(instructor, '$[0]'))
        ELSE JSON_UNQUOTE(instructor)
      END
    `);

    // 修改字段类型回VARCHAR
    await queryInterface.sequelize.query(`
      ALTER TABLE course_offerings 
      MODIFY COLUMN instructor VARCHAR(100)
    `);

    // 恢复instructor索引
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE course_offerings 
        ADD INDEX idx_instructor (instructor)
      `);
    } catch (error) {
      // 如果索引已存在，忽略错误
      console.log('Index idx_instructor may already exist, continuing...');
    }
  }
};

