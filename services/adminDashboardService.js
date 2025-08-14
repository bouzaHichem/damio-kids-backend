const analyticsService = require('./analyticsService');
const inventoryService = require('./inventoryService');
const emailService = require('./emailService');
const cacheService = require('./cacheService');
const websocketService = require('./websocketService');
const { Product, Order, User } = require('../models');

class AdminDashboardService {
  constructor() {
    this.cacheKeys = {
      dashboard: 'admin:dashboard',
      notifications: 'admin:notifications',
      alerts: 'admin:alerts',
      activity: 'admin:activity'
    };
    
    this.alertThresholds = {
      lowStock: 10,
      criticalStock: 5,
      pendingOrders: 20,
      highOrderVolume: 50
    };
  }
  
  /**
   * Get comprehensive admin dashboard data
   */
  async getDashboardOverview() {
    try {
      const cacheKey = `${this.cacheKeys.dashboard}:overview`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      // Parallel execution for better performance
      const [analyticsData, inventoryAlerts, systemHealth, recentActivity] = await Promise.all([
        this.getAnalyticsOverview(),
        this.getInventoryAlerts(),
        this.getSystemHealth(),
        this.getRecentActivity()
      ]);
      
      const dashboardData = {
        analytics: analyticsData,
        alerts: await this.generateAlerts(),
        inventory: inventoryAlerts,
        system: systemHealth,
        activity: recentActivity,
        notifications: await this.getNotificationsSummary(),
        lastUpdated: new Date().toISOString()
      };
      
      // Cache for 5 minutes
      await cacheService.set(cacheKey, dashboardData, 300);
      
      // Broadcast real-time updates to connected admins
      websocketService.notifyAdmins('dashboard_updated', dashboardData);
      
      return dashboardData;
    } catch (error) {
      console.error('Error getting dashboard overview:', error);
      throw error;
    }
  }
  
  /**
   * Get analytics overview for admin dashboard
   */
  async getAnalyticsOverview() {
    const [dashboardStats, realtimeMetrics, salesTrends] = await Promise.all([
      analyticsService.getDashboardStats(),
      analyticsService.getRealtimeMetrics(),
      analyticsService.getSalesTrends('daily', {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      })
    ]);
    
    return {
      summary: dashboardStats.summary,
      realtime: realtimeMetrics,
      weeklyTrends: salesTrends,
      topProducts: dashboardStats.topPerformers.products.slice(0, 5),
      alerts: this.extractAnalyticsAlerts(dashboardStats, realtimeMetrics)
    };
  }
  
  /**
   * Get inventory alerts and status
   */
  async getInventoryAlerts() {
    const [stockLevels, lowStockProducts, outOfStockProducts, reorderPoints] = await Promise.all([
      analyticsService.getStockLevelDistribution(),
      Product.find({ 
        stock_quantity: { $lte: this.alertThresholds.lowStock, $gt: 0 }, 
        status: 'active' 
      }).select('name category stock_quantity new_price').lean(),
      Product.find({ stock_quantity: 0 }).select('name category new_price').lean(),
      analyticsService.getReorderPoints()
    ]);
    
    return {
      stockLevels,
      alerts: {
        lowStock: lowStockProducts.length,
        outOfStock: outOfStockProducts.length,
        criticalReorder: reorderPoints.filter(p => p.priority === 'High').length
      },
      lowStockProducts: lowStockProducts.slice(0, 10),
      outOfStockProducts: outOfStockProducts.slice(0, 10),
      reorderPriority: reorderPoints.slice(0, 10)
    };
  }
  
  /**
   * Get system health metrics
   */
  async getSystemHealth() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Database connection status
    const dbStatus = await this.checkDatabaseHealth();
    
    // Cache status
    const cacheStatus = await this.checkCacheHealth();
    
    // WebSocket connections
    const wsConnections = websocketService.getConnectionStats();
    
    return {
      server: {
        uptime,
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        },
        cpu: await this.getCPUUsage()
      },
      database: dbStatus,
      cache: cacheStatus,
      websockets: wsConnections,
      status: this.getOverallSystemStatus(dbStatus, cacheStatus, memUsage)
    };
  }
  
  /**
   * Get recent admin activity
   */
  async getRecentActivity() {
    const [recentOrders, recentUsers, systemEvents] = await Promise.all([
      Order.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .select('orderNumber customerInfo.name total status createdAt')
        .lean(),
      User.find({ role: { $ne: 'admin' } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name email createdAt isActive')
        .lean(),
      this.getSystemEvents()
    ]);
    
    return {
      recentOrders,
      newUsers: recentUsers,
      systemEvents
    };
  }
  
  /**
   * Generate comprehensive alerts
   */
  async generateAlerts() {
    const alerts = [];
    
    // Inventory alerts
    const lowStockCount = await Product.countDocuments({ 
      stock_quantity: { $lte: this.alertThresholds.lowStock, $gt: 0 },
      status: 'active'
    });
    
    const outOfStockCount = await Product.countDocuments({ stock_quantity: 0 });
    
    if (lowStockCount > 0) {
      alerts.push({
        id: 'low_stock',
        type: 'warning',
        category: 'inventory',
        title: 'Low Stock Alert',
        message: `${lowStockCount} products are running low on stock`,
        count: lowStockCount,
        priority: 'medium',
        actionRequired: true,
        createdAt: new Date().toISOString()
      });
    }
    
    if (outOfStockCount > 0) {
      alerts.push({
        id: 'out_of_stock',
        type: 'error',
        category: 'inventory',
        title: 'Out of Stock Alert',
        message: `${outOfStockCount} products are out of stock`,
        count: outOfStockCount,
        priority: 'high',
        actionRequired: true,
        createdAt: new Date().toISOString()
      });
    }
    
    // Order alerts
    const pendingOrdersCount = await Order.countDocuments({ status: 'pending' });
    
    if (pendingOrdersCount > this.alertThresholds.pendingOrders) {
      alerts.push({
        id: 'pending_orders',
        type: 'warning',
        category: 'orders',
        title: 'High Pending Orders',
        message: `${pendingOrdersCount} orders are pending confirmation`,
        count: pendingOrdersCount,
        priority: 'high',
        actionRequired: true,
        createdAt: new Date().toISOString()
      });
    }
    
    // System alerts
    const memUsage = process.memoryUsage();
    const memPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    if (memPercentage > 80) {
      alerts.push({
        id: 'high_memory',
        type: 'warning',
        category: 'system',
        title: 'High Memory Usage',
        message: `Memory usage is at ${Math.round(memPercentage)}%`,
        priority: 'medium',
        actionRequired: false,
        createdAt: new Date().toISOString()
      });
    }
    
    // Email service alerts
    const emailStats = await emailService.getEmailStats();
    if (emailStats.failed > 10) {
      alerts.push({
        id: 'email_failures',
        type: 'error',
        category: 'email',
        title: 'Email Delivery Issues',
        message: `${emailStats.failed} emails have failed to deliver`,
        count: emailStats.failed,
        priority: 'high',
        actionRequired: true,
        createdAt: new Date().toISOString()
      });
    }
    
    return alerts.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
  
  /**
   * Get notifications summary
   */
  async getNotificationsSummary() {
    const [unreadNotifications, recentNotifications] = await Promise.all([
      this.getUnreadNotificationsCount(),
      this.getRecentNotifications(10)
    ]);
    
    return {
      unread: unreadNotifications,
      recent: recentNotifications,
      categories: this.categorizeNotifications(recentNotifications)
    };
  }
  
  /**
   * Real-time dashboard updates
   */
  async broadcastRealtimeUpdate(type, data) {
    const updateData = {
      type,
      data,
      timestamp: new Date().toISOString()
    };
    
    // Broadcast to all connected admins
    websocketService.notifyAdmins('realtime_update', updateData);
    
    // Update cache if needed
    if (type === 'order_status_change' || type === 'inventory_update') {
      await this.invalidateDashboardCache();
    }
  }
  
  /**
   * Generate and export reports
   */
  async generateReport(type, options = {}) {
    const { period = 'monthly', format = 'json', startDate, endDate } = options;
    
    try {
      const report = await analyticsService.generateReport(type, {
        period,
        startDate,
        endDate,
        format
      });
      
      // Log report generation
      await this.logAdminAction('report_generated', {
        type,
        period,
        format,
        timestamp: new Date().toISOString()
      });
      
      return report;
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }
  
  /**
   * Bulk operations for admin actions
   */
  async performBulkAction(action, targets, options = {}) {
    const results = {
      success: [],
      failed: [],
      summary: {
        total: targets.length,
        processed: 0,
        errors: 0
      }
    };
    
    try {
      for (const target of targets) {
        try {
          const result = await this.executeBulkAction(action, target, options);
          results.success.push({ target, result });
          results.summary.processed++;
        } catch (error) {
          results.failed.push({ target, error: error.message });
          results.summary.errors++;
        }
      }
      
      // Log bulk action
      await this.logAdminAction('bulk_action', {
        action,
        totalTargets: targets.length,
        processed: results.summary.processed,
        errors: results.summary.errors
      });
      
      // Notify about completion
      websocketService.notifyAdmins('bulk_action_completed', {
        action,
        results: results.summary
      });
      
      return results;
    } catch (error) {
      console.error('Error performing bulk action:', error);
      throw error;
    }
  }
  
  /**
   * Helper methods
   */
  
  extractAnalyticsAlerts(dashboardStats, realtimeMetrics) {
    const alerts = [];
    
    if (realtimeMetrics.pendingOrders > this.alertThresholds.pendingOrders) {
      alerts.push({
        type: 'warning',
        message: `${realtimeMetrics.pendingOrders} orders pending confirmation`,
        value: realtimeMetrics.pendingOrders
      });
    }
    
    if (realtimeMetrics.hourlyOrders > this.alertThresholds.highOrderVolume) {
      alerts.push({
        type: 'info',
        message: `High order volume: ${realtimeMetrics.hourlyOrders} orders in the last hour`,
        value: realtimeMetrics.hourlyOrders
      });
    }
    
    return alerts;
  }
  
  async checkDatabaseHealth() {
    try {
      // Simple database ping
      await Product.findOne().limit(1);
      return {
        status: 'healthy',
        responseTime: Date.now(),
        connections: 'active'
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        responseTime: null
      };
    }
  }
  
  async checkCacheHealth() {
    try {
      if (!cacheService) {
        return { status: 'disabled' };
      }
      
      const testKey = 'health_check';
      await cacheService.set(testKey, 'ok', 10);
      const result = await cacheService.get(testKey);
      await cacheService.delete(testKey);
      
      return {
        status: result === 'ok' ? 'healthy' : 'error',
        responseTime: Date.now()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
  
  async getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      
      setTimeout(() => {
        const currentUsage = process.cpuUsage(startUsage);
        const cpuPercent = (currentUsage.user + currentUsage.system) / 1000000; // Convert to seconds
        resolve(Math.round(cpuPercent * 100) / 100);
      }, 100);
    });
  }
  
  getOverallSystemStatus(dbStatus, cacheStatus, memUsage) {
    const memPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    if (dbStatus.status !== 'healthy') {
      return { status: 'critical', message: 'Database connection issues' };
    }
    
    if (memPercentage > 90) {
      return { status: 'warning', message: 'High memory usage' };
    }
    
    if (cacheStatus.status === 'error') {
      return { status: 'warning', message: 'Cache service issues' };
    }
    
    return { status: 'healthy', message: 'All systems operational' };
  }
  
  async getSystemEvents() {
    // This would typically come from a system events log
    // For now, return mock data
    return [
      {
        id: '1',
        type: 'system_start',
        message: 'Server started successfully',
        timestamp: new Date().toISOString(),
        level: 'info'
      }
    ];
  }
  
  async getUnreadNotificationsCount() {
    // Mock implementation - would typically come from a notifications table
    return Math.floor(Math.random() * 10);
  }
  
  async getRecentNotifications(limit = 10) {
    // Mock implementation - would typically come from a notifications table
    return [
      {
        id: '1',
        title: 'New order received',
        message: 'Order #12345 has been placed',
        type: 'order',
        read: false,
        timestamp: new Date().toISOString()
      }
    ];
  }
  
  categorizeNotifications(notifications) {
    return notifications.reduce((acc, notif) => {
      acc[notif.type] = (acc[notif.type] || 0) + 1;
      return acc;
    }, {});
  }
  
  async executeBulkAction(action, target, options) {
    switch (action) {
      case 'update_product_status':
        return await Product.findByIdAndUpdate(target, { status: options.status });
      case 'update_order_status':
        return await Order.findByIdAndUpdate(target, { status: options.status });
      case 'send_email':
        return await emailService.sendEmail(target, options.template, options.data);
      default:
        throw new Error(`Unknown bulk action: ${action}`);
    }
  }
  
  async logAdminAction(action, details) {
    // This would typically log to a database or file
    console.log('Admin Action:', {
      action,
      details,
      timestamp: new Date().toISOString()
    });
  }
  
  async invalidateDashboardCache() {
    await cacheService.deletePattern(`${this.cacheKeys.dashboard}:*`);
  }
  
  /**
   * Scheduled tasks for maintenance
   */
  async runScheduledMaintenance() {
    try {
      // Clear old cache entries
      await this.cleanupCache();
      
      // Generate daily reports
      await this.generateDailyReports();
      
      // Check for system health issues
      await this.performHealthChecks();
      
      // Send low stock notifications
      await this.sendInventoryAlerts();
      
      console.log('Scheduled maintenance completed successfully');
    } catch (error) {
      console.error('Error during scheduled maintenance:', error);
    }
  }
  
  async cleanupCache() {
    // Clear cache entries older than 24 hours
    await cacheService.deletePattern('analytics:*');
    await cacheService.deletePattern('admin:dashboard:*');
  }
  
  async generateDailyReports() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();
    
    try {
      const dailyReport = await analyticsService.generateReport('sales', {
        period: 'daily',
        startDate: yesterday,
        endDate: today
      });
      
      // Store or email the report
      await this.logAdminAction('daily_report_generated', {
        report: dailyReport.summary
      });
    } catch (error) {
      console.error('Error generating daily report:', error);
    }
  }
  
  async performHealthChecks() {
    const health = await this.getSystemHealth();
    
    if (health.status.status !== 'healthy') {
      websocketService.notifyAdmins('system_health_alert', {
        status: health.status,
        details: health
      });
    }
  }
  
  async sendInventoryAlerts() {
    const lowStockProducts = await Product.find({ 
      stock_quantity: { $lte: this.alertThresholds.lowStock },
      status: 'active'
    }).lean();
    
    if (lowStockProducts.length > 0) {
      // Send email notification to admins
      try {
        await emailService.sendLowStockAlert(lowStockProducts);
        
        // Notify via WebSocket
        websocketService.notifyAdmins('inventory_alert', {
          type: 'low_stock',
          count: lowStockProducts.length,
          products: lowStockProducts.slice(0, 5) // Send top 5
        });
      } catch (error) {
        console.error('Error sending inventory alerts:', error);
      }
    }
  }
}

module.exports = new AdminDashboardService();
