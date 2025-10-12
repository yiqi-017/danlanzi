const { DataTypes, Sequelize } = require('sequelize');
const { sequelize } = require('../config/database');

const VerificationCode = sequelize.define('VerificationCode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: '邮箱地址'
  },
  code: {
    type: DataTypes.STRING(6),
    allowNull: false,
    comment: '验证码'
  },
  type: {
    type: DataTypes.ENUM('email_verification', 'password_reset', 'login'),
    allowNull: false,
    defaultValue: 'email_verification',
    comment: '验证码类型'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: '过期时间'
  },
  isUsed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否已使用'
  },
  usedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '使用时间'
  }
}, {
  tableName: 'verification_codes',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['email', 'type']
    },
    {
      fields: ['expiresAt']
    }
  ]
});

module.exports = VerificationCode;
