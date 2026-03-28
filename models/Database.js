/**
 * JSON文件数据库 - 轻量级数据存储
 * 使用JSON文件替代SQLite，避免symlink限制
 */

const fs = require('fs');
const path = require('path');

class Database {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.collections = {
      users: [],
      articles: [],
      products: [],
      interactions: [],
      comments: [],
      subscriptions: [],
      originalRequests: [],
      notifications: [],
      settings: [],
      logs: []
    };
    this.init();
  }

  // 初始化数据库
  init() {
    // 确保数据目录存在
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // 加载所有集合
    Object.keys(this.collections).forEach(collection => {
      this.load(collection);
    });

    console.log('📦 JSON数据库已初始化');
  }

  // 获取文件路径
  getFilePath(collection) {
    return path.join(this.dataDir, `${collection}.json`);
  }

  // 加载集合数据
  load(collection) {
    const filePath = this.getFilePath(collection);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        this.collections[collection] = JSON.parse(data);
      } else {
        // 文件不存在，创建空文件
        this.save(collection, this.collections[collection]);
      }
    } catch (error) {
      console.error(`加载集合 ${collection} 失败:`, error);
      this.collections[collection] = [];
    }
  }

  // 保存集合数据
  save(collection, data) {
    const filePath = this.getFilePath(collection);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      this.collections[collection] = data;
      return true;
    } catch (error) {
      console.error(`保存集合 ${collection} 失败:`, error);
      return false;
    }
  }

  // 创建记录
  create(collection, item) {
    const data = this.collections[collection];
    // 生成唯一ID
    if (!item.id) {
      item.id = `${collection}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    item.createdAt = new Date().toISOString();
    item.updatedAt = new Date().toISOString();
    data.push(item);
    this.save(collection, data);
    return item;
  }

  // 查询所有记录
  findAll(collection, options = {}) {
    let data = [...this.collections[collection]];
    
    // 过滤
    if (options.where) {
      data = data.filter(item => {
        return Object.entries(options.where).every(([key, value]) => {
          if (typeof value === 'object' && value.$regex) {
            return new RegExp(value.$regex, 'i').test(item[key]);
          }
          if (typeof value === 'object' && value.$in) {
            return value.$in.includes(item[key]);
          }
          return item[key] === value;
        });
      });
    }

    // 排序
    if (options.orderBy) {
      const [field, order] = options.orderBy.split(' ');
      data.sort((a, b) => {
        if (order === 'DESC') {
          return b[field] > a[field] ? 1 : -1;
        }
        return a[field] > b[field] ? 1 : -1;
      });
    }

    // 分页
    if (options.limit) {
      const page = options.page || 1;
      const offset = (page - 1) * options.limit;
      data = data.slice(offset, offset + options.limit);
    }

    return data;
  }

  // 查询单条记录
  findOne(collection, where) {
    const results = this.findAll(collection, { where });
    return results[0] || null;
  }

  // 根据ID查询
  findById(collection, id) {
    return this.findOne(collection, { id });
  }

  // 更新记录
  update(collection, id, updates) {
    const data = this.collections[collection];
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return null;
    
    data[index] = {
      ...data[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.save(collection, data);
    return data[index];
  }

  // 删除记录
  delete(collection, id) {
    const data = this.collections[collection];
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return false;
    
    data.splice(index, 1);
    this.save(collection, data);
    return true;
  }

  // 计数
  count(collection, where = {}) {
    return this.findAll(collection, { where }).length;
  }

  // 批量插入
  batchInsert(collection, items) {
    const data = this.collections[collection];
    const inserted = [];
    items.forEach(item => {
      if (!item.id) {
        item.id = `${collection}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      item.createdAt = new Date().toISOString();
      item.updatedAt = new Date().toISOString();
      data.push(item);
      inserted.push(item);
    });
    this.save(collection, data);
    return inserted;
  }

  // 导出数据
  export(collection, format = 'json') {
    const data = this.collections[collection];
    if (format === 'csv') {
      if (data.length === 0) return '';
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(item => 
        Object.values(item).map(v => 
          typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
        ).join(',')
      );
      return [headers, ...rows].join('\n');
    }
    return JSON.stringify(data, null, 2);
  }

  // 导入数据
  import(collection, data, merge = false) {
    if (merge) {
      const existing = this.collections[collection];
      const merged = [...existing, ...data];
      this.save(collection, merged);
    } else {
      this.save(collection, data);
    }
    return data.length;
  }

  // 备份所有数据
  backup() {
    const backupDir = path.join(this.dataDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup_${timestamp}.json`);
    
    const backup = {
      timestamp: new Date().toISOString(),
      data: this.collections
    };
    
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), 'utf8');
    return backupFile;
  }

  // 从备份恢复
  restore(backupFile) {
    try {
      const data = fs.readFileSync(backupFile, 'utf8');
      const backup = JSON.parse(data);
      
      Object.entries(backup.data).forEach(([collection, items]) => {
        this.save(collection, items);
      });
      
      return true;
    } catch (error) {
      console.error('恢复备份失败:', error);
      return false;
    }
  }
}

// 单例模式
let instance = null;

module.exports = {
  Database,
  getInstance: () => {
    if (!instance) {
      instance = new Database();
    }
    return instance;
  }
};
