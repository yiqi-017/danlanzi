const { sequelize } = require('../config/database');

// 导入模型
const User = require('./User');
const Course = require('./Course');
const CourseOffering = require('./CourseOffering');
const Enrollment = require('./Enrollment');
const Resource = require('./Resource');
const ResourceCourseLink = require('./ResourceCourseLink');
const ResourceFavorite = require('./ResourceFavorite');
const ResourceStat = require('./ResourceStat');
const CourseReview = require('./CourseReview');
const ReviewComment = require('./ReviewComment');
const Notification = require('./Notification');
const Announcement = require('./Announcement');
const UserAnnouncementRead = require('./UserAnnouncementRead');
const Report = require('./Report');
const ModerationQueue = require('./ModerationQueue');
const File = require('./File');
const VerificationCode = require('./VerificationCode');

// 用户关联
User.hasMany(Enrollment, { foreignKey: 'user_id', as: 'enrollments' });
User.hasMany(Resource, { foreignKey: 'uploader_id', as: 'uploadedResources' });
User.hasMany(ResourceFavorite, { foreignKey: 'user_id', as: 'favoriteResources' });
User.hasMany(CourseReview, { foreignKey: 'author_id', as: 'reviews' });
User.hasMany(ReviewComment, { foreignKey: 'user_id', as: 'comments' });
User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
User.hasMany(Announcement, { foreignKey: 'created_by', as: 'createdAnnouncements' });
User.hasMany(UserAnnouncementRead, { foreignKey: 'user_id', as: 'readAnnouncements' });
User.hasMany(Report, { foreignKey: 'reporter_id', as: 'reports' });
User.hasMany(ModerationQueue, { foreignKey: 'handled_by', as: 'moderationActions' });
User.hasMany(File, { foreignKey: 'uploader_id', as: 'uploadedFiles' });

// 课程关联
Course.hasMany(CourseOffering, { foreignKey: 'course_id', as: 'offerings' });
Course.hasMany(ResourceCourseLink, { foreignKey: 'course_id', as: 'resourceLinks' });
Course.hasMany(CourseReview, { foreignKey: 'course_id', as: 'reviews' });

CourseOffering.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
CourseOffering.hasMany(Enrollment, { foreignKey: 'offering_id', as: 'enrollments' });
CourseOffering.hasMany(ResourceCourseLink, { foreignKey: 'offering_id', as: 'resourceLinks' });
CourseOffering.hasMany(CourseReview, { foreignKey: 'offering_id', as: 'reviews' });

Enrollment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Enrollment.belongsTo(CourseOffering, { foreignKey: 'offering_id', as: 'offering' });

// 资源关联
Resource.belongsTo(User, { foreignKey: 'uploader_id', as: 'uploader' });
Resource.hasMany(ResourceCourseLink, { foreignKey: 'resource_id', as: 'courseLinks' });
Resource.hasMany(ResourceFavorite, { foreignKey: 'resource_id', as: 'favorites' });
Resource.hasOne(ResourceStat, { foreignKey: 'resource_id', as: 'stats' });

ResourceCourseLink.belongsTo(Resource, { foreignKey: 'resource_id', as: 'resource' });
ResourceCourseLink.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
ResourceCourseLink.belongsTo(CourseOffering, { foreignKey: 'offering_id', as: 'offering' });

ResourceFavorite.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ResourceFavorite.belongsTo(Resource, { foreignKey: 'resource_id', as: 'resource' });

ResourceStat.belongsTo(Resource, { foreignKey: 'resource_id', as: 'resource' });

// 评价关联
CourseReview.belongsTo(User, { foreignKey: 'author_id', as: 'author' });
CourseReview.belongsTo(Course, { foreignKey: 'course_id', as: 'course' });
CourseReview.belongsTo(CourseOffering, { foreignKey: 'offering_id', as: 'offering' });
CourseReview.hasMany(ReviewComment, { foreignKey: 'review_id', as: 'comments' });

ReviewComment.belongsTo(CourseReview, { foreignKey: 'review_id', as: 'review' });
ReviewComment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 通知关联
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Announcement.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Announcement.hasMany(UserAnnouncementRead, { foreignKey: 'announcement_id', as: 'reads' });

UserAnnouncementRead.belongsTo(Announcement, { foreignKey: 'announcement_id', as: 'announcement' });
UserAnnouncementRead.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// 举报关联
Report.belongsTo(User, { foreignKey: 'reporter_id', as: 'reporter' });

ModerationQueue.belongsTo(User, { foreignKey: 'handled_by', as: 'handler' });

// 文件关联
File.belongsTo(User, { foreignKey: 'uploader_id', as: 'uploader' });

module.exports = {
  sequelize,
  User,
  Course,
  CourseOffering,
  Enrollment,
  Resource,
  ResourceCourseLink,
  ResourceFavorite,
  ResourceStat,
  CourseReview,
  ReviewComment,
  Notification,
  Announcement,
  UserAnnouncementRead,
  Report,
  ModerationQueue,
  File,
  VerificationCode
};
