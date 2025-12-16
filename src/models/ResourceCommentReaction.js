const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ResourceCommentReaction = sequelize.define('ResourceCommentReaction', {
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true
  },
  comment_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true
  },
  reaction: {
    type: DataTypes.ENUM('like', 'dislike'),
    allowNull: false
  }
}, {
  tableName: 'resource_comment_reactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['comment_id'] },
    { fields: ['reaction'] }
  ]
});

module.exports = ResourceCommentReaction;

