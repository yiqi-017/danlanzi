const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ResourceLike = sequelize.define('ResourceLike', {
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true
  },
  resource_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true
  }
}, {
  tableName: 'resource_likes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['resource_id'] }
  ]
});

module.exports = ResourceLike;


