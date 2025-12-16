const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ResourceCommentStat = sequelize.define('ResourceCommentStat', {
  comment_id: {
    type: DataTypes.BIGINT,
    primaryKey: true
  },
  like_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: { min: 0 }
  },
  dislike_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: { min: 0 }
  },
  net_score: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  last_reacted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'resource_comment_stats',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['like_count'] },
    { fields: ['dislike_count'] },
    { fields: ['net_score'] }
  ]
});

module.exports = ResourceCommentStat;

