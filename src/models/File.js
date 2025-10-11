const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const File = sequelize.define('File', {
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
  storage_provider: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['OSS', 'S3', 'local']]
    }
  },
  bucket: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  object_key: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  size: {
    type: DataTypes.BIGINT,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  mime_type: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  hash: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'files',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      fields: ['uploader_id']
    },
    {
      fields: ['storage_provider']
    },
    {
      fields: ['mime_type']
    },
    {
      fields: ['hash']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = File;
