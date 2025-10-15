const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  student_id: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      len: [1, 255]
    }
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  nickname: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  avatar_path: {
    type: DataTypes.STRING(1024),
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    defaultValue: 'user'
  },
  status: {
    type: DataTypes.ENUM('active', 'banned', 'deleted'),
    defaultValue: 'active'
  },
  department: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  major: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  security_email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  theme: {
    type: DataTypes.ENUM('light', 'dark', 'auto'),
    defaultValue: 'dark'
  },
  language: {
    type: DataTypes.ENUM('zh-CN', 'en-US'),
    defaultValue: 'zh-CN'
  },
  unified_auth_password: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  show_student_id: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  show_department: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  show_major: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  show_bio: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['email']
    },
    {
      unique: true,
      fields: ['student_id']
    },
    {
      fields: ['security_email']
    },
    {
      fields: ['status']
    },
    {
      fields: ['role']
    },
    {
      fields: ['department']
    },
    {
      fields: ['major']
    }
  ]
});

module.exports = User;
