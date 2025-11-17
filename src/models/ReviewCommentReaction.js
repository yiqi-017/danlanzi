const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ReviewCommentReaction = sequelize.define('ReviewCommentReaction', {
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
  tableName: 'review_comment_reactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['comment_id'] },
    { fields: ['reaction'] }
  ]
});

module.exports = ReviewCommentReaction;


