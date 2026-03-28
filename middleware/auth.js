/**
 * 认证中间件
 * JWT验证、管理员验证、防刷限制
 */

const jwt = require('jsonwebtoken');
const { getInstance } = require('../models/Database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES = '7d';
const REFRESH_EXPIRES = '30d';

// 生成Token
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id, 
      phone: user.phone, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
};

// 生成刷新Token
const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );
};

// JWT认证中间件
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: '未提供认证令牌'
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: '登录已过期，请重新登录',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({
        success: false,
        message: '无效的认证令牌'
      });
    }
  } catch (error) {
    console.error('认证中间件错误:', error);
    return res.status(500).json({
      success: false,
      message: '认证失败'
    });
  }
};

// 可选认证（不强制要求登录）
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
      } catch (error) {
        // 忽略验证错误，继续作为未登录用户
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

// 管理员验证中间件
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: '请先登录'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: '权限不足，需要管理员权限'
    });
  }

  next();
};

// 请求频率限制（内存存储，生产环境建议使用Redis）
const requestLimits = new Map();

const rateLimit = (options = {}) => {
  const { 
    windowMs = 60000, // 1分钟
    maxRequests = 100, // 最大请求数
    keyGenerator = (req) => req.ip // 默认按IP限制
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    if (!requestLimits.has(key)) {
      requestLimits.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const limit = requestLimits.get(key);
    
    // 重置过期计数
    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }

    // 检查限制
    if (limit.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil((limit.resetTime - now) / 1000)
      });
    }

    limit.count++;
    next();
  };
};

// 防刷限制（针对特定操作）
const actionLimits = new Map();

const actionLimit = (action, options = {}) => {
  const {
    windowMs = 3600000, // 1小时
    maxActions = 10 // 最大操作次数
  } = options;

  return (req, res, next) => {
    const userId = req.user?.userId || req.ip;
    const key = `${action}:${userId}`;
    const now = Date.now();

    if (!actionLimits.has(key)) {
      actionLimits.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const limit = actionLimits.get(key);

    if (now > limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + windowMs;
      return next();
    }

    if (limit.count >= maxActions) {
      return res.status(429).json({
        success: false,
        message: `操作过于频繁，请${Math.ceil((limit.resetTime - now) / 60000)}分钟后再试`
      });
    }

    limit.count++;
    next();
  };
};

// 清理过期限制（每小时运行一次）
setInterval(() => {
  const now = Date.now();
  
  for (const [key, limit] of requestLimits.entries()) {
    if (now > limit.resetTime) {
      requestLimits.delete(key);
    }
  }
  
  for (const [key, limit] of actionLimits.entries()) {
    if (now > limit.resetTime) {
      actionLimits.delete(key);
    }
  }
}, 3600000);

module.exports = {
  generateToken,
  generateRefreshToken,
  authenticate,
  optionalAuth,
  requireAdmin,
  rateLimit,
  actionLimit,
  JWT_SECRET
};
