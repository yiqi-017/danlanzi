const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserAnnouncementRead = sequelize.define('UserAnnouncementRead', {
  announcement_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true,
    references: {
      model: 'announcements',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    primaryKey: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  read_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_announcement_reads',
  timestamps: false,
  indexes: [
    {
      fields: ['announcement_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['read_at']
    }
  ]
});

module.exports = UserAnnouncementRead;
