const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  reporter_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  entity_type: {
    type: DataTypes.ENUM('resource', 'review', 'resource_comment', 'review_comment'),
    allowNull: false
  },
  entity_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  reason: {
    type: DataTypes.ENUM('plagiarism', 'abuse', 'spam', 'other'),
    allowNull: false
  },
  details: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'handled'),
    defaultValue: 'pending'
  }
}, {
  tableName: 'reports',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      fields: ['reporter_id']
    },
    {
      fields: ['entity_type', 'entity_id']
    },
    {
      fields: ['reason']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = Report;
