const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CourseOffering = sequelize.define('CourseOffering', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  course_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'courses',
      key: 'id'
    }
  },
  term: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      len: [1, 50]
    }
  },
  section: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  instructor: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '授课老师，JSON数组格式，如 ["张三", "李四"]'
  },
  schedule_json: {
    type: DataTypes.JSON,
    allowNull: true
  },
  extra_info: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'course_offerings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      fields: ['course_id']
    },
    {
      fields: ['term']
    },
    // 移除了instructor索引，因为JSON字段不能直接索引
    {
      unique: true,
      fields: ['course_id', 'term', 'section']
    }
  ]
});

module.exports = CourseOffering;
