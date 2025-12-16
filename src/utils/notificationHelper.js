// 通知辅助函数
const { Notification } = require('../models');

/**
 * 创建通知
 * @param {Object} params - 通知参数
 * @param {number} params.user_id - 用户ID
 * @param {string} params.type - 通知类型: 'system' | 'resource' | 'review' | 'comment' | 'announcement'
 * @param {string} [params.title] - 通知标题
 * @param {string} [params.content] - 通知内容
 * @param {string} [params.entity_type] - 关联实体类型
 * @param {number} [params.entity_id] - 关联实体ID
 * @returns {Promise<Notification>}
 */
async function createNotification(params) {
  try {
    const { user_id, type, title, content, entity_type, entity_id } = params;
    
    if (!user_id || !type) {
      console.warn('创建通知失败: 缺少必要参数', params);
      return null;
    }

    const notification = await Notification.create({
      user_id,
      type,
      title: title || null,
      content: content || null,
      entity_type: entity_type || null,
      entity_id: entity_id || null,
      is_read: false
    });

    return notification;
  } catch (error) {
    console.error('创建通知失败:', error);
    return null;
  }
}

/**
 * 批量创建通知
 * @param {Array<Object>} notifications - 通知数组
 * @returns {Promise<Array<Notification>>}
 */
async function createNotifications(notifications) {
  try {
    if (!notifications || notifications.length === 0) {
      return [];
    }

    const validNotifications = notifications.filter(n => n.user_id && n.type);
    if (validNotifications.length === 0) {
      return [];
    }

    const created = await Notification.bulkCreate(
      validNotifications.map(n => ({
        user_id: n.user_id,
        type: n.type,
        title: n.title || null,
        content: n.content || null,
        entity_type: n.entity_type || null,
        entity_id: n.entity_id || null,
        is_read: false
      }))
    );

    return created;
  } catch (error) {
    console.error('批量创建通知失败:', error);
    return [];
  }
}

module.exports = {
  createNotification,
  createNotifications
};
