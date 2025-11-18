// JWT认证中间件
const jwt = require('jsonwebtoken');

/**
 * JWT Token验证中间件
 * 统一处理token验证，包括过期和无效token的情况
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // 没有提供token
  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Access token required',
      code: 'TOKEN_MISSING'
    });
  }

  // 验证token
  jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key', (err, decoded) => {
    if (err) {
      // Token过期
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({
          status: 'error',
          message: 'Token has expired',
          code: 'TOKEN_EXPIRED',
          expiredAt: err.expiredAt
        });
      }
      
      // Token无效（格式错误、签名错误等）
      if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({
          status: 'error',
          message: 'Invalid token',
          code: 'TOKEN_INVALID'
        });
      }

      // 其他错误
      return res.status(403).json({
        status: 'error',
        message: 'Invalid or expired token',
        code: 'TOKEN_ERROR'
      });
    }

    // Token验证成功，将用户信息附加到请求对象
    req.user = decoded;
    next();
  });
};

/**
 * 管理员权限验证中间件
 * 必须在 authenticateToken 之后使用
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Admin privileges required',
      code: 'ADMIN_REQUIRED'
    });
  }

  next();
};

/**
 * 可选认证中间件
 * 如果提供了token则验证，否则继续执行（不要求登录）
 */
const optionalAuthenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  // 没有提供token，继续执行（不要求登录）
  if (!token) {
    return next();
  }

  // 验证token
  jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key', (err, decoded) => {
    if (err) {
      // Token无效或过期，但不阻止请求，只是不设置req.user
      return next();
    }

    // Token验证成功，将用户信息附加到请求对象
    req.user = decoded;
    next();
  });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  optionalAuthenticateToken
};

