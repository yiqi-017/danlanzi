const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ResourceComment = sequelize.define('ResourceComment', {
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
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [1, 2000]
    }
  },
  status: {
    type: DataTypes.ENUM('normal', 'blocked', 'deleted'),
    defaultValue: 'normal'
  }
}, {
  tableName: 'resource_comments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      fields: ['resource_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = ResourceComment;

