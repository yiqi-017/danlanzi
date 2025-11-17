const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ReviewReaction = sequelize.define('ReviewReaction', {
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true
  },
  review_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true
  },
  reaction: {
    type: DataTypes.ENUM('like', 'dislike'),
    allowNull: false
  }
}, {
  tableName: 'review_reactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['review_id'] },
    { fields: ['reaction'] }
  ]
});

module.exports = ReviewReaction;


