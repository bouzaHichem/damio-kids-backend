const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { performance, PerformanceObserver } = require('perf_hooks');
const cacheService = require('./cacheService');
const websocketService = require('./websocketService');

class PerformanceMonitoringService {
  constructor() {
    this.metrics = new Map();
    this.alerts = [];
    this.isMonitoring = false;
    this.performanceObserver = null;
    
    // Configuration
    this.config = {
      // Sampling rates
      metricsSamplingInterval: 10000, // 10 seconds
      detailedMetricsInterval: 60000, // 1 minute
      
      // Thresholds for alerts
      thresholds: {
        cpu: 80, // CPU usage percentage
        memory: 85, // Memory usage percentage
        responseTime: 2000, // Response time in ms
        errorRate: 5, // Error rate percentage
        diskUsage: 90, // Disk usage percentage
        activeConnections: 1000, // Max active connections
        queueLength: 100, // Max queue length
        dbConnectionPool: 80 // DB connection pool usage percentage
      },
      
      // Retention periods
      retention: {
        realtime: 300000, // 5 minutes in ms
        hourly: 86400000, // 24 hours in ms
        daily: 604800000, // 7 days in ms
        weekly: 2592000000 // 30 days in ms
      }
    };
    
    // Metrics storage
    this.metricsStore = {
      realtime: new Map(),
      hourly: new Map(),
      daily: new Map(),
      weekly: new Map()
    };
    
    // Cache keys
    this.cacheKeys = {
      metrics: (interval) => `performance:metrics:${interval}`,
      alerts: 'performance:alerts',
      systemHealth: 'performance:system_health',
      apdex: 'performance:apdex',
      trends: (period) => `performance:trends:${period}`
    };
    
    this.initializeMonitoring();
  }
  
  /**
   * Initialize performance monitoring
   */
  async initializeMonitoring() {
    try {
      // Setup performance observer for Node.js internal metrics
      this.setupPerformanceObserver();
      
      // Start monitoring intervals
      this.startMetricsCollection();
      
      // Setup cleanup intervals
      this.startCleanupTasks();
      
      this.isMonitoring = true;
      console.log('Performance monitoring initialized');
      
    } catch (error) {
      console.error('Error initializing performance monitoring:', error);
    }
  }
  
  /**
   * Setup performance observer for internal Node.js metrics
   */
  setupPerformanceObserver() {
    this.performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      
      entries.forEach(entry => {
        if (entry.entryType === 'measure') {
          this.recordMetric('performance_measure', {
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime,
            timestamp: Date.now()
          });
        } else if (entry.entryType === 'navigation') {
          this.recordMetric('navigation', {
            domContentLoadedEventEnd: entry.domContentLoadedEventEnd,
            loadEventEnd: entry.loadEventEnd,
            timestamp: Date.now()
          });
        }
      });
    });
    
    this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
  }
  
  /**
   * Start metrics collection intervals
   */
  startMetricsCollection() {
    // Collect basic metrics every 10 seconds
    setInterval(async () => {
      await this.collectSystemMetrics();
    }, this.config.metricsSamplingInterval);
    
    // Collect detailed metrics every minute
    setInterval(async () => {
      await this.collectDetailedMetrics();
      await this.analyzePerformanceTrends();
      await this.checkThresholds();
    }, this.config.detailedMetricsInterval);
    
    // Generate performance reports every 5 minutes
    setInterval(async () => {
      await this.generatePerformanceReport();
    }, 300000);
  }
  
  /**
   * Start cleanup tasks
   */
  startCleanupTasks() {
    // Clean up old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
  }
  
  /**
   * Record a custom metric
   */
  recordMetric(metricName, data) {
    const timestamp = Date.now();
    const metric = {
      name: metricName,
      value: data.value || data,
      metadata: data.metadata || {},
      timestamp,
      ...data
    };
    
    // Store in different time intervals
    this.storeMetric('realtime', metric);
    this.storeMetricAggregated('hourly', metric);
    this.storeMetricAggregated('daily', metric);
    this.storeMetricAggregated('weekly', metric);
    
    // Check if metric triggers any alerts
    this.checkMetricThreshold(metricName, metric);
  }
  
  /**
   * Collect system metrics
   */
  async collectSystemMetrics() {
    try {
      const timestamp = Date.now();
      
      // CPU metrics
      const cpuUsage = await this.getCPUUsage();
      this.recordMetric('cpu_usage', { value: cpuUsage, timestamp });
      
      // Memory metrics
      const memoryUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const memoryUsagePercent = ((totalMemory - freeMemory) / totalMemory) * 100;
      
      this.recordMetric('memory_usage', {
        value: memoryUsagePercent,
        heap_used: memoryUsage.heapUsed,
        heap_total: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
        timestamp
      });
      
      // Load average
      const loadAverage = os.loadavg();
      this.recordMetric('load_average', {
        value: loadAverage[0],
        load_1m: loadAverage[0],
        load_5m: loadAverage[1],
        load_15m: loadAverage[2],
        timestamp
      });
      
      // Event loop lag
      const eventLoopLag = this.measureEventLoopLag();
      this.recordMetric('event_loop_lag', { value: eventLoopLag, timestamp });
      
      // Garbage collection metrics
      if (global.gc && global.gc.getHeapStatistics) {
        const heapStats = global.gc.getHeapStatistics();
        this.recordMetric('gc_stats', {
          total_heap_size: heapStats.total_heap_size,
          used_heap_size: heapStats.used_heap_size,
          heap_size_limit: heapStats.heap_size_limit,
          timestamp
        });
      }
      
    } catch (error) {
      console.error('Error collecting system metrics:', error);
    }
  }
  
  /**
   * Collect detailed metrics
   */
  async collectDetailedMetrics() {
    try {
      const timestamp = Date.now();
      
      // Disk usage
      const diskUsage = await this.getDiskUsage();
      this.recordMetric('disk_usage', { ...diskUsage, timestamp });
      
      // Network metrics
      const networkStats = await this.getNetworkStats();
      this.recordMetric('network_stats', { ...networkStats, timestamp });
      
      // Process metrics
      const processMetrics = this.getProcessMetrics();
      this.recordMetric('process_metrics', { ...processMetrics, timestamp });
      
      // Database metrics (if applicable)
      await this.collectDatabaseMetrics();
      
      // Cache metrics
      await this.collectCacheMetrics();
      
      // Application-specific metrics
      await this.collectApplicationMetrics();
      
    } catch (error) {
      console.error('Error collecting detailed metrics:', error);
    }
  }
  
  /**
   * Collect database metrics
   */
  async collectDatabaseMetrics() {
    try {
      // MongoDB metrics (if using Mongoose)
      if (global.mongoose && global.mongoose.connection) {
        const db = global.mongoose.connection;
        
        this.recordMetric('database_connections', {
          value: db.readyState,
          ready_state: db.readyState,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      console.error('Error collecting database metrics:', error);
    }
  }
  
  /**
   * Collect cache metrics
   */
  async collectCacheMetrics() {
    try {
      if (cacheService) {
        const cacheStats = await cacheService.getStats();
        this.recordMetric('cache_stats', {
          ...cacheStats,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error collecting cache metrics:', error);
    }
  }
  
  /**
   * Collect application-specific metrics
   */
  async collectApplicationMetrics() {
    try {
      const timestamp = Date.now();
      
      // HTTP request metrics (would be integrated with Express middleware)
      const httpMetrics = this.getHTTPMetrics();
      if (httpMetrics) {
        this.recordMetric('http_metrics', { ...httpMetrics, timestamp });
      }
      
      // WebSocket connection metrics
      if (websocketService) {
        const wsStats = websocketService.getConnectionStats();
        this.recordMetric('websocket_connections', {
          ...wsStats,
          timestamp
        });
      }
      
      // Custom application metrics
      await this.collectCustomApplicationMetrics();
      
    } catch (error) {
      console.error('Error collecting application metrics:', error);
    }
  }
  
  /**
   * Track HTTP request performance
   */
  trackHTTPRequest(req, res, responseTime) {
    const metric = {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
      response_time: responseTime,
      user_agent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: Date.now()
    };
    
    this.recordMetric('http_request', metric);
    
    // Track errors separately
    if (res.statusCode >= 400) {
      this.recordMetric('http_error', {
        ...metric,
        error_type: res.statusCode >= 500 ? 'server_error' : 'client_error'
      });
    }
    
    // Update Apdex score
    this.updateApdexScore(responseTime);
  }
  
  /**
   * Track database query performance
   */
  trackDatabaseQuery(operation, collection, duration, success = true) {
    const metric = {
      operation,
      collection,
      duration,
      success,
      timestamp: Date.now()
    };
    
    this.recordMetric('database_query', metric);
  }
  
  /**
   * Track custom business metrics
   */
  trackBusinessMetric(metricName, value, metadata = {}) {
    this.recordMetric(`business_${metricName}`, {
      value,
      metadata,
      timestamp: Date.now()
    });
  }
  
  /**
   * Get performance dashboard data
   */
  async getPerformanceDashboard() {
    try {
      const now = Date.now();
      const oneHour = 3600000;
      
      // Get recent metrics
      const recentMetrics = this.getMetricsInTimeRange('realtime', now - oneHour, now);
      
      // System health overview
      const systemHealth = await this.getSystemHealth();
      
      // Top slow endpoints
      const slowEndpoints = this.getSlowEndpoints();
      
      // Error rate trends
      const errorTrends = this.getErrorTrends();
      
      // Resource utilization
      const resourceUtilization = this.getResourceUtilization();
      
      // Apdex score
      const apdexScore = await this.getApdexScore();
      
      // Active alerts
      const activeAlerts = this.getActiveAlerts();
      
      return {
        systemHealth,
        slowEndpoints,
        errorTrends,
        resourceUtilization,
        apdexScore,
        activeAlerts,
        recentMetrics: this.aggregateMetrics(recentMetrics),
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Error getting performance dashboard:', error);
      return null;
    }
  }
  
  /**
   * Get system health status
   */
  async getSystemHealth() {
    const cacheKey = this.cacheKeys.systemHealth;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;
    
    const health = {
      overall: 'healthy',
      components: {
        cpu: 'healthy',
        memory: 'healthy',
        disk: 'healthy',
        database: 'healthy',
        cache: 'healthy'
      },
      scores: {
        performance: 100,
        reliability: 100,
        security: 100
      }
    };
    
    // Check CPU health
    const recentCPU = this.getRecentMetricValue('cpu_usage');
    if (recentCPU > this.config.thresholds.cpu) {
      health.components.cpu = recentCPU > 95 ? 'critical' : 'warning';
      health.scores.performance -= 20;
    }
    
    // Check memory health
    const recentMemory = this.getRecentMetricValue('memory_usage');
    if (recentMemory > this.config.thresholds.memory) {
      health.components.memory = recentMemory > 95 ? 'critical' : 'warning';
      health.scores.performance -= 15;
    }
    
    // Check disk health
    const recentDisk = this.getRecentMetricValue('disk_usage');
    if (recentDisk && recentDisk.percentage > this.config.thresholds.diskUsage) {
      health.components.disk = recentDisk.percentage > 95 ? 'critical' : 'warning';
      health.scores.performance -= 10;
    }
    
    // Determine overall health
    const componentStates = Object.values(health.components);
    if (componentStates.includes('critical')) {
      health.overall = 'critical';
    } else if (componentStates.includes('warning')) {
      health.overall = 'warning';
    }
    
    await cacheService.set(cacheKey, health, 30); // Cache for 30 seconds
    return health;
  }
  
  /**
   * Generate performance alerts
   */
  async checkThresholds() {
    const alerts = [];
    const now = Date.now();
    
    // CPU threshold check
    const cpuUsage = this.getRecentMetricValue('cpu_usage');
    if (cpuUsage > this.config.thresholds.cpu) {
      alerts.push({
        id: `cpu_${now}`,
        type: 'cpu_high',
        severity: cpuUsage > 95 ? 'critical' : 'warning',
        message: `CPU usage is ${cpuUsage.toFixed(1)}%`,
        value: cpuUsage,
        threshold: this.config.thresholds.cpu,
        timestamp: now
      });
    }
    
    // Memory threshold check
    const memoryUsage = this.getRecentMetricValue('memory_usage');
    if (memoryUsage > this.config.thresholds.memory) {
      alerts.push({
        id: `memory_${now}`,
        type: 'memory_high',
        severity: memoryUsage > 95 ? 'critical' : 'warning',
        message: `Memory usage is ${memoryUsage.toFixed(1)}%`,
        value: memoryUsage,
        threshold: this.config.thresholds.memory,
        timestamp: now
      });
    }
    
    // Response time threshold check
    const avgResponseTime = this.getAverageResponseTime();
    if (avgResponseTime > this.config.thresholds.responseTime) {
      alerts.push({
        id: `response_time_${now}`,
        type: 'response_time_high',
        severity: avgResponseTime > this.config.thresholds.responseTime * 2 ? 'critical' : 'warning',
        message: `Average response time is ${avgResponseTime.toFixed(0)}ms`,
        value: avgResponseTime,
        threshold: this.config.thresholds.responseTime,
        timestamp: now
      });
    }
    
    // Error rate threshold check
    const errorRate = this.getErrorRate();
    if (errorRate > this.config.thresholds.errorRate) {
      alerts.push({
        id: `error_rate_${now}`,
        type: 'error_rate_high',
        severity: errorRate > this.config.thresholds.errorRate * 2 ? 'critical' : 'warning',
        message: `Error rate is ${errorRate.toFixed(1)}%`,
        value: errorRate,
        threshold: this.config.thresholds.errorRate,
        timestamp: now
      });
    }
    
    // Store alerts
    this.alerts = [...this.alerts, ...alerts].slice(-100); // Keep last 100 alerts
    
    // Notify about critical alerts
    const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
    if (criticalAlerts.length > 0) {
      await this.notifyAboutAlerts(criticalAlerts);
    }
  }
  
  /**
   * Helper Methods
   */
  
  storeMetric(interval, metric) {
    const store = this.metricsStore[interval];
    const key = `${metric.name}_${metric.timestamp}`;
    
    store.set(key, metric);
    
    // Cleanup old metrics based on retention period
    const retentionTime = this.config.retention[interval];
    const cutoff = Date.now() - retentionTime;
    
    for (const [key, storedMetric] of store.entries()) {
      if (storedMetric.timestamp < cutoff) {
        store.delete(key);
      }
    }
  }
  
  storeMetricAggregated(interval, metric) {
    // For aggregated intervals, we store summary statistics
    const store = this.metricsStore[interval];
    const timeWindow = this.getTimeWindow(interval, metric.timestamp);
    const key = `${metric.name}_${timeWindow}`;
    
    const existing = store.get(key) || {
      name: metric.name,
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      values: [],
      timestamp: timeWindow
    };
    
    if (typeof metric.value === 'number') {
      existing.count++;
      existing.sum += metric.value;
      existing.min = Math.min(existing.min, metric.value);
      existing.max = Math.max(existing.max, metric.value);
      existing.average = existing.sum / existing.count;
    }
    
    // Store recent values for percentile calculations
    existing.values.push(metric.value);
    if (existing.values.length > 1000) {
      existing.values = existing.values.slice(-1000);
    }
    
    store.set(key, existing);
  }
  
  getTimeWindow(interval, timestamp) {
    const date = new Date(timestamp);
    
    switch (interval) {
      case 'hourly':
        return Math.floor(date.getTime() / 3600000) * 3600000;
      case 'daily':
        date.setHours(0, 0, 0, 0);
        return date.getTime();
      case 'weekly':
        const dayOfWeek = date.getDay();
        date.setDate(date.getDate() - dayOfWeek);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
      default:
        return timestamp;
    }
  }
  
  async getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const currentUsage = process.cpuUsage(startUsage);
        const cpuPercent = (currentUsage.user + currentUsage.system) / 1000000;
        resolve(Math.min(cpuPercent * 100, 100));
      }, 100);
    });
  }
  
  async getDiskUsage() {
    try {
      const stats = await fs.stat('.');
      // This is a simplified version - in production, use proper disk usage libraries
      return {
        percentage: Math.random() * 30 + 20, // Mock data
        used: Math.random() * 1000000000,
        total: 1000000000
      };
    } catch (error) {
      return { percentage: 0, used: 0, total: 0 };
    }
  }
  
  async getNetworkStats() {
    const interfaces = os.networkInterfaces();
    let stats = {
      interfaces: Object.keys(interfaces).length,
      active_connections: Math.floor(Math.random() * 50) + 10 // Mock data
    };
    
    return stats;
  }
  
  getProcessMetrics() {
    return {
      pid: process.pid,
      uptime: process.uptime(),
      version: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }
  
  measureEventLoopLag() {
    const start = process.hrtime.bigint();
    return new Promise((resolve) => {
      setImmediate(() => {
        const lag = process.hrtime.bigint() - start;
        resolve(Number(lag / 1000000n)); // Convert to milliseconds
      });
    });
  }
  
  getRecentMetricValue(metricName) {
    const recent = Array.from(this.metricsStore.realtime.values())
      .filter(metric => metric.name === metricName)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    
    return recent ? recent.value : null;
  }
  
  getMetricsInTimeRange(interval, startTime, endTime) {
    return Array.from(this.metricsStore[interval].values())
      .filter(metric => metric.timestamp >= startTime && metric.timestamp <= endTime);
  }
  
  aggregateMetrics(metrics) {
    const aggregated = {};
    
    metrics.forEach(metric => {
      if (!aggregated[metric.name]) {
        aggregated[metric.name] = {
          name: metric.name,
          values: [],
          count: 0,
          sum: 0,
          min: Infinity,
          max: -Infinity
        };
      }
      
      const agg = aggregated[metric.name];
      if (typeof metric.value === 'number') {
        agg.values.push(metric.value);
        agg.count++;
        agg.sum += metric.value;
        agg.min = Math.min(agg.min, metric.value);
        agg.max = Math.max(agg.max, metric.value);
      }
    });
    
    // Calculate derived metrics
    Object.keys(aggregated).forEach(key => {
      const agg = aggregated[key];
      if (agg.count > 0) {
        agg.average = agg.sum / agg.count;
        agg.values.sort((a, b) => a - b);
        agg.median = agg.values[Math.floor(agg.values.length / 2)];
        agg.p95 = agg.values[Math.floor(agg.values.length * 0.95)];
        agg.p99 = agg.values[Math.floor(agg.values.length * 0.99)];
      }
    });
    
    return aggregated;
  }
  
  getHTTPMetrics() {
    // This would be populated by Express middleware
    return this.httpMetricsCache || null;
  }
  
  async collectCustomApplicationMetrics() {
    // Placeholder for custom business metrics
    this.recordMetric('active_users', {
      value: Math.floor(Math.random() * 1000) + 500,
      timestamp: Date.now()
    });
    
    this.recordMetric('orders_per_minute', {
      value: Math.floor(Math.random() * 10) + 1,
      timestamp: Date.now()
    });
  }
  
  getSlowEndpoints() {
    // Analyze HTTP request metrics to find slow endpoints
    const httpMetrics = Array.from(this.metricsStore.realtime.values())
      .filter(metric => metric.name === 'http_request' && metric.response_time > 1000);
    
    const endpointStats = {};
    
    httpMetrics.forEach(metric => {
      const key = `${metric.method} ${metric.route}`;
      if (!endpointStats[key]) {
        endpointStats[key] = {
          endpoint: key,
          count: 0,
          totalTime: 0,
          maxTime: 0
        };
      }
      
      const stats = endpointStats[key];
      stats.count++;
      stats.totalTime += metric.response_time;
      stats.maxTime = Math.max(stats.maxTime, metric.response_time);
      stats.avgTime = stats.totalTime / stats.count;
    });
    
    return Object.values(endpointStats)
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);
  }
  
  getErrorTrends() {
    const now = Date.now();
    const oneHour = 3600000;
    const intervals = 12; // 5-minute intervals
    const intervalSize = oneHour / intervals;
    
    const trends = [];
    
    for (let i = 0; i < intervals; i++) {
      const start = now - oneHour + (i * intervalSize);
      const end = start + intervalSize;
      
      const totalRequests = Array.from(this.metricsStore.realtime.values())
        .filter(metric => 
          metric.name === 'http_request' && 
          metric.timestamp >= start && 
          metric.timestamp < end
        ).length;
      
      const errorRequests = Array.from(this.metricsStore.realtime.values())
        .filter(metric => 
          metric.name === 'http_error' && 
          metric.timestamp >= start && 
          metric.timestamp < end
        ).length;
      
      const errorRate = totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
      
      trends.push({
        timestamp: start,
        errorRate,
        totalRequests,
        errorRequests
      });
    }
    
    return trends;
  }
  
  getResourceUtilization() {
    return {
      cpu: this.getRecentMetricValue('cpu_usage') || 0,
      memory: this.getRecentMetricValue('memory_usage') || 0,
      disk: this.getRecentMetricValue('disk_usage')?.percentage || 0,
      eventLoopLag: this.getRecentMetricValue('event_loop_lag') || 0
    };
  }
  
  async getApdexScore() {
    const cacheKey = this.cacheKeys.apdex;
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;
    
    // Calculate Apdex score based on response times
    const recentRequests = Array.from(this.metricsStore.realtime.values())
      .filter(metric => metric.name === 'http_request' && metric.response_time)
      .slice(-1000); // Last 1000 requests
    
    if (recentRequests.length === 0) return { score: 1, level: 'Excellent' };
    
    const threshold = 500; // 500ms threshold
    const tolerationThreshold = threshold * 4; // 2000ms
    
    let satisfied = 0;
    let tolerating = 0;
    
    recentRequests.forEach(request => {
      if (request.response_time <= threshold) {
        satisfied++;
      } else if (request.response_time <= tolerationThreshold) {
        tolerating++;
      }
    });
    
    const score = (satisfied + (tolerating * 0.5)) / recentRequests.length;
    
    let level;
    if (score >= 0.94) level = 'Excellent';
    else if (score >= 0.85) level = 'Good';
    else if (score >= 0.70) level = 'Fair';
    else level = 'Poor';
    
    const result = { score, level, sampleSize: recentRequests.length };
    
    await cacheService.set(cacheKey, result, 60);
    return result;
  }
  
  getActiveAlerts() {
    const now = Date.now();
    const oneHour = 3600000;
    
    return this.alerts.filter(alert => now - alert.timestamp < oneHour);
  }
  
  getAverageResponseTime() {
    const recentRequests = Array.from(this.metricsStore.realtime.values())
      .filter(metric => metric.name === 'http_request' && metric.response_time)
      .slice(-100);
    
    if (recentRequests.length === 0) return 0;
    
    const sum = recentRequests.reduce((acc, req) => acc + req.response_time, 0);
    return sum / recentRequests.length;
  }
  
  getErrorRate() {
    const now = Date.now();
    const fiveMinutes = 300000;
    const start = now - fiveMinutes;
    
    const totalRequests = Array.from(this.metricsStore.realtime.values())
      .filter(metric => 
        metric.name === 'http_request' && 
        metric.timestamp >= start
      ).length;
    
    const errorRequests = Array.from(this.metricsStore.realtime.values())
      .filter(metric => 
        metric.name === 'http_error' && 
        metric.timestamp >= start
      ).length;
    
    return totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
  }
  
  updateApdexScore(responseTime) {
    // This would update a running Apdex calculation
    // Implementation depends on specific requirements
  }
  
  checkMetricThreshold(metricName, metric) {
    // Check if individual metric exceeds thresholds
    // This is called for each metric recorded
  }
  
  async notifyAboutAlerts(alerts) {
    try {
      // Notify admins via WebSocket
      if (websocketService) {
        websocketService.notifyAdmins('performance_alerts', alerts);
      }
      
      // Log critical alerts
      alerts.forEach(alert => {
        console.warn(`PERFORMANCE ALERT [${alert.severity}]: ${alert.message}`);
      });
      
    } catch (error) {
      console.error('Error notifying about alerts:', error);
    }
  }
  
  cleanupOldMetrics() {
    Object.keys(this.metricsStore).forEach(interval => {
      const retentionTime = this.config.retention[interval];
      const cutoff = Date.now() - retentionTime;
      const store = this.metricsStore[interval];
      
      for (const [key, metric] of store.entries()) {
        if (metric.timestamp < cutoff) {
          store.delete(key);
        }
      }
    });
  }
  
  async analyzePerformanceTrends() {
    // Analyze trends and predict potential issues
    // This is where you'd implement more sophisticated analysis
  }
  
  async generatePerformanceReport() {
    try {
      const dashboard = await this.getPerformanceDashboard();
      
      // Store report for historical analysis
      await cacheService.set(
        `performance:report:${Date.now()}`,
        dashboard,
        86400 // 24 hours
      );
      
      // Broadcast to connected admins
      if (websocketService) {
        websocketService.notifyAdmins('performance_report', dashboard);
      }
      
    } catch (error) {
      console.error('Error generating performance report:', error);
    }
  }
  
  /**
   * Express middleware for automatic HTTP tracking
   */
  createExpressMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Track request start
      this.recordMetric('http_request_start', {
        method: req.method,
        path: req.path,
        timestamp: startTime
      });
      
      // Override res.end to capture response time
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        const responseTime = Date.now() - startTime;
        
        // Track the completed request
        this.trackHTTPRequest(req, res, responseTime);
        
        // Call original end
        originalEnd.call(res, chunk, encoding);
      }.bind(this);
      
      next();
    };
  }
  
  /**
   * Stop monitoring and cleanup
   */
  stopMonitoring() {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    
    this.isMonitoring = false;
    console.log('Performance monitoring stopped');
  }
}

module.exports = new PerformanceMonitoringService();
