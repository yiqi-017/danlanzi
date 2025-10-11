const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Enrollment = sequelize.define('Enrollment', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  offering_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'course_offerings',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('enrolled', 'completed', 'dropped'),
    defaultValue: 'enrolled'
  },
  score: {
    type: DataTypes.DECIMAL(3, 1),
    allowNull: true,
    validate: {
      min: 0,
      max: 100
    }
  }
}, {
  tableName: 'enrollments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['offering_id']
    },
    {
      fields: ['status']
    },
    {
      unique: true,
      fields: ['user_id', 'offering_id']
    }
  ]
});

module.exports = Enrollment;
