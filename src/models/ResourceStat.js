const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ResourceStat = sequelize.define('ResourceStat', {
  resource_id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    references: {
      model: 'resources',
      key: 'id'
    }
  },
  view_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  download_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  favorite_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  like_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  report_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  last_interacted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'resource_stats',
  timestamps: false,
  indexes: [
    {
      fields: ['view_count']
    },
    {
      fields: ['download_count']
    },
    {
      fields: ['favorite_count']
    },
    {
      fields: ['like_count']
    }
  ]
});

module.exports = ResourceStat;
