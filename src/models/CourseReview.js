const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CourseReview = sequelize.define('CourseReview', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  author_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  course_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'courses',
      key: 'id'
    }
  },
  offering_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: 'course_offerings',
      key: 'id'
    }
  },
  rating_overall: {
    type: DataTypes.TINYINT,
    allowNull: true,
    validate: {
      min: 1,
      max: 5
    }
  },
  rating_difficulty: {
    type: DataTypes.TINYINT,
    allowNull: true,
    validate: {
      min: 1,
      max: 5
    }
  },
  rating_workload: {
    type: DataTypes.TINYINT,
    allowNull: true,
    validate: {
      min: 1,
      max: 5
    }
  },
  rating_teaching: {
    type: DataTypes.TINYINT,
    allowNull: true,
    validate: {
      min: 1,
      max: 5
    }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      len: [0, 255]
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_anonymous: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM('normal', 'blocked', 'deleted'),
    defaultValue: 'normal'
  }
}, {
  tableName: 'course_reviews',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      fields: ['author_id']
    },
    {
      fields: ['course_id']
    },
    {
      fields: ['offering_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    },
    {
      unique: true,
      fields: ['author_id', 'course_id', 'offering_id']
    }
  ]
});

module.exports = CourseReview;
