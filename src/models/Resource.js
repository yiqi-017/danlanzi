const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Resource = sequelize.define('Resource', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  uploader_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('file', 'link', 'note'),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      len: [1, 255]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  url_or_path: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  visibility: {
    type: DataTypes.ENUM('public', 'course', 'private'),
    defaultValue: 'public'
  },
  status: {
    type: DataTypes.ENUM('normal', 'blocked', 'deleted'),
    defaultValue: 'normal'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '资源标签，JSON数组格式'
  }
}, {
  tableName: 'resources',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['uploader_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['visibility']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = Resource;
