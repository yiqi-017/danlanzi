const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ResourceCourseLink = sequelize.define('ResourceCourseLink', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  resource_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'resources',
      key: 'id'
    }
  },
  course_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
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
  }
}, {
  tableName: 'resource_course_links',
  timestamps: false,
  indexes: [
    {
      fields: ['resource_id']
    },
    {
      fields: ['course_id']
    },
    {
      fields: ['offering_id']
    },
    {
      unique: true,
      fields: ['resource_id', 'course_id', 'offering_id']
    }
  ]
});

module.exports = ResourceCourseLink;
