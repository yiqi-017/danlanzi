const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ResourceFavorite = sequelize.define('ResourceFavorite', {
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  resource_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true,
    references: {
      model: 'resources',
      key: 'id'
    }
  }
}, {
  tableName: 'resource_favorites',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['resource_id']
    }
  ]
});

module.exports = ResourceFavorite;
