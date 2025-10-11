const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ModerationQueue = sequelize.define('ModerationQueue', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  entity_type: {
    type: DataTypes.ENUM('resource', 'review', 'comment'),
    allowNull: false
  },
  entity_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  report_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'removed'),
    defaultValue: 'pending'
  },
  handled_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  handled_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'moderation_queue',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['entity_type', 'entity_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['report_count']
    },
    {
      fields: ['handled_by']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = ModerationQueue;
