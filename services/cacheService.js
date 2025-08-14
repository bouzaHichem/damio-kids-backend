const redis = require('redis');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.initializeCache();
  }
  
  /**
   * Initialize Redis connection
   */
  async initializeCache() {
    try {
      // Check if Redis is configured
      if (!process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
        console.warn('Redis not configured in production. Performance may be impacted.');
        return;
      }
      
      // Create Redis client
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.warn('Redis server is not running. Running without cache.');
            return undefined;
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });
      
      // Handle connection events
      this.client.on('connect', () => {
        console.log('Redis client connected');
        this.isConnected = true;
      });
      
      this.client.on('error', (error) => {
        console.warn('Redis client error:', error.message);
        this.isConnected = false;
      });
      
      this.client.on('end', () => {
        console.log('Redis client disconnected');
        this.isConnected = false;
      });
      
      // Connect to Redis
      await this.client.connect();
      
    } catch (error) {
      console.warn('Failed to initialize Redis cache:', error.message);
      this.isConnected = false;
    }
  }
  
  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} - Cached value or null
   */
  async get(key) {
    if (!this.isConnected) return null;
    
    try {
      const value = await this.client.get(key);
      if (value) {
        return JSON.parse(value);
      }
      return null;
    } catch (error) {
      console.error('Cache get error:', error.message);
      return null;
    }
  }
  
  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: 300)
   */
  async set(key, value, ttl = 300) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Cache set error:', error.message);
      return false;
    }
  }
  
  /**
   * Delete key from cache
   * @param {string} key - Cache key
   */
  async del(key) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error.message);
      return false;
    }
  }
  
  /**
   * Delete multiple keys with pattern
   * @param {string} pattern - Key pattern (e.g., "products:*")
   */
  async delPattern(pattern) {
    if (!this.isConnected) return false;
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error('Cache delete pattern error:', error.message);
      return false;
    }
  }
  
  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   */
  async exists(key) {
    if (!this.isConnected) return false;
    
    try {
      return await this.client.exists(key) === 1;
    } catch (error) {
      console.error('Cache exists error:', error.message);
      return false;
    }
  }
  
  /**
   * Get multiple keys
   * @param {string[]} keys - Array of cache keys
   */
  async mget(keys) {
    if (!this.isConnected || keys.length === 0) return {};
    
    try {
      const values = await this.client.mGet(keys);
      const result = {};
      keys.forEach((key, index) => {
        if (values[index]) {
          try {
            result[key] = JSON.parse(values[index]);
          } catch (parseError) {
            console.warn('Failed to parse cached value for key:', key);
            result[key] = null;
          }
        } else {
          result[key] = null;
        }
      });
      return result;
    } catch (error) {
      console.error('Cache mget error:', error.message);
      return {};
    }
  }
  
  /**
   * Set multiple keys
   * @param {Object} keyValues - Object with key-value pairs
   * @param {number} ttl - Time to live in seconds
   */
  async mset(keyValues, ttl = 300) {
    if (!this.isConnected || Object.keys(keyValues).length === 0) return false;
    
    try {
      const multi = this.client.multi();
      
      Object.entries(keyValues).forEach(([key, value]) => {
        multi.setEx(key, ttl, JSON.stringify(value));
      });
      
      await multi.exec();
      return true;
    } catch (error) {
      console.error('Cache mset error:', error.message);
      return false;
    }
  }
  
  /**
   * Increment a numeric value
   * @param {string} key - Cache key
   * @param {number} increment - Increment value (default: 1)
   */
  async incr(key, increment = 1) {
    if (!this.isConnected) return 0;
    
    try {
      if (increment === 1) {
        return await this.client.incr(key);
      } else {
        return await this.client.incrBy(key, increment);
      }
    } catch (error) {
      console.error('Cache increment error:', error.message);
      return 0;
    }
  }
  
  /**
   * Set expiration for a key
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   */
  async expire(key, ttl) {
    if (!this.isConnected) return false;
    
    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      console.error('Cache expire error:', error.message);
      return false;
    }
  }
  
  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isConnected) {
      return {
        connected: false,
        keys: 0,
        memory: '0B',
        hits: 0,
        misses: 0
      };
    }
    
    try {
      const info = await this.client.info('stats');
      const memory = await this.client.info('memory');
      const dbsize = await this.client.dbSize();
      
      // Parse Redis info
      const parseInfo = (infoString) => {
        const result = {};
        infoString.split('\r\n').forEach(line => {
          if (line.includes(':')) {
            const [key, value] = line.split(':');
            result[key] = value;
          }
        });
        return result;
      };
      
      const statsInfo = parseInfo(info);
      const memoryInfo = parseInfo(memory);
      
      return {
        connected: true,
        keys: dbsize,
        memory: memoryInfo.used_memory_human || '0B',
        hits: parseInt(statsInfo.keyspace_hits) || 0,
        misses: parseInt(statsInfo.keyspace_misses) || 0,
        hitRatio: statsInfo.keyspace_hits && statsInfo.keyspace_misses 
          ? ((parseInt(statsInfo.keyspace_hits) / (parseInt(statsInfo.keyspace_hits) + parseInt(statsInfo.keyspace_misses))) * 100).toFixed(2) + '%'
          : '0%'
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error.message);
      return {
        connected: false,
        error: error.message
      };
    }
  }
  
  /**
   * Clear all cache
   */
  async flush() {
    if (!this.isConnected) return false;
    
    try {
      await this.client.flushDb();
      console.log('Cache flushed successfully');
      return true;
    } catch (error) {
      console.error('Cache flush error:', error.message);
      return false;
    }
  }
  
  /**
   * Generate cache key with prefix
   * @param {string} type - Cache type (e.g., 'products', 'search', 'user')
   * @param {string} identifier - Unique identifier
   * @param {...string} extras - Additional key parts
   */
  generateKey(type, identifier, ...extras) {
    const parts = ['damio', type, identifier, ...extras].filter(Boolean);
    return parts.join(':');
  }
  
  /**
   * Cache with automatic key generation
   * @param {string} type - Cache type
   * @param {string} identifier - Unique identifier
   * @param {Function} dataFetcher - Function to fetch data if not cached
   * @param {number} ttl - Time to live in seconds
   */
  async cacheOrFetch(type, identifier, dataFetcher, ttl = 300) {
    const key = this.generateKey(type, identifier);
    
    // Try to get from cache first
    let cachedData = await this.get(key);
    if (cachedData !== null) {
      return cachedData;
    }
    
    // Fetch fresh data
    try {
      const freshData = await dataFetcher();
      
      // Cache the result
      await this.set(key, freshData, ttl);
      
      return freshData;
    } catch (error) {
      console.error('Data fetcher error:', error.message);
      throw error;
    }
  }
  
  /**
   * Graceful shutdown
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      try {
        await this.client.disconnect();
        console.log('Redis client disconnected gracefully');
      } catch (error) {
        console.error('Error during Redis disconnect:', error.message);
      }
    }
  }
}

// Export singleton instance
module.exports = new CacheService();
