const { Product, Order, User, Category } = require('../models');
const cacheService = require('./cacheService');
const websocketService = require('./websocketService');

class AnalyticsService {
  
  constructor() {
    this.cacheKeys = {
      dashboard: 'analytics:dashboard',
      sales: 'analytics:sales',
      products: 'analytics:products',
      users: 'analytics:users',
      realtime: 'analytics:realtime'
    };
  }
  
  /**
   * Get comprehensive dashboard statistics
   * @param {Object} dateRange - Date range filter
   */
  static async getDashboardStats(dateRange = {}) {
    const { startDate, endDate } = this.getDateRange(dateRange);
    
    const [
      salesStats,
      productStats,
      userStats,
      orderStats,
      topProducts,
      topCategories,
      recentOrders
    ] = await Promise.all([
      this.getSalesStats(startDate, endDate),
      this.getProductStats(),
      this.getUserStats(startDate, endDate),
      this.getOrderStats(startDate, endDate),
      this.getTopProducts(startDate, endDate, 10),
      this.getTopCategories(startDate, endDate, 5),
      this.getRecentOrders(10)
    ]);
    
    return {
      summary: {
        totalRevenue: salesStats.totalRevenue,
        totalOrders: orderStats.totalOrders,
        totalProducts: productStats.totalProducts,
        totalUsers: userStats.totalUsers,
        averageOrderValue: salesStats.averageOrderValue,
        conversionRate: this.calculateConversionRate(userStats.totalUsers, orderStats.totalOrders)
      },
      sales: salesStats,
      products: productStats,
      users: userStats,
      orders: orderStats,
      topPerformers: {
        products: topProducts,
        categories: topCategories
      },
      recentActivity: {
        orders: recentOrders
      },
      dateRange: {
        startDate,
        endDate
      }
    };
  }
  
  /**
   * Get sales statistics
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   */
  static async getSalesStats(startDate, endDate) {
    const dateFilter = {
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['delivered', 'shipped', 'processing', 'confirmed'] }
    };
    
    const [salesData, previousPeriodData] = await Promise.all([
      Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' },
            totalOrders: { $sum: 1 },
            averageOrderValue: { $avg: '$total' },
            totalDeliveryFees: { $sum: '$deliveryFee' }
          }
        }
      ]),
      this.getPreviousPeriodSales(startDate, endDate)
    ]);
    
    const current = salesData[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      totalDeliveryFees: 0
    };
    
    // Calculate daily sales trend
    const dailySales = await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            day: { $dayOfMonth: '$date' }
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    return {
      totalRevenue: current.totalRevenue,
      totalOrders: current.totalOrders,
      averageOrderValue: Math.round(current.averageOrderValue || 0),
      totalDeliveryFees: current.totalDeliveryFees,
      dailySales,
      growth: this.calculateGrowthRate(current.totalRevenue, previousPeriodData.totalRevenue),
      orderGrowth: this.calculateGrowthRate(current.totalOrders, previousPeriodData.totalOrders)
    };
  }
  
  /**
   * Get product statistics
   */
  static async getProductStats() {
    const [productData, stockData, categoryCount] = await Promise.all([
      Product.aggregate([
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            activeProducts: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            totalStock: { $sum: '$stock_quantity' },
            totalValue: {
              $sum: { $multiply: ['$stock_quantity', '$new_price'] }
            }
          }
        }
      ]),
      Product.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            stockValue: {
              $sum: { $multiply: ['$stock_quantity', '$new_price'] }
            }
          }
        }
      ]),
      Category.countDocuments({})
    ]);
    
    const current = productData[0] || {
      totalProducts: 0,
      activeProducts: 0,
      totalStock: 0,
      totalValue: 0
    };
    
    // Process stock data by status
    const stockByStatus = {};
    stockData.forEach(item => {
      stockByStatus[item._id] = {
        count: item.count,
        value: item.stockValue
      };
    });
    
    // Get low stock products count
    const lowStockCount = await Product.countDocuments({
      stock_quantity: { $lte: 10, $gt: 0 },
      status: 'active'
    });
    
    const outOfStockCount = await Product.countDocuments({
      stock_quantity: 0
    });
    
    return {
      totalProducts: current.totalProducts,
      activeProducts: current.activeProducts,
      totalCategories: categoryCount,
      totalStock: current.totalStock,
      totalStockValue: current.totalValue,
      stockDistribution: {
        active: stockByStatus.active || { count: 0, value: 0 },
        inactive: stockByStatus.inactive || { count: 0, value: 0 },
        outOfStock: stockByStatus.out_of_stock || { count: 0, value: 0 }
      },
      alerts: {
        lowStock: lowStockCount,
        outOfStock: outOfStockCount
      }
    };
  }
  
  /**
   * Get user statistics
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   */
  static async getUserStats(startDate, endDate) {
    const dateFilter = { date: { $gte: startDate, $lte: endDate } };
    
    const [userCounts, newUsers, activeUsers] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: {
              $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
            },
            adminUsers: {
              $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] }
            }
          }
        }
      ]),
      User.countDocuments(dateFilter),
      User.countDocuments({
        lastLogin: { $gte: startDate, $lte: endDate },
        isActive: true
      })
    ]);
    
    const current = userCounts[0] || {
      totalUsers: 0,
      activeUsers: 0,
      adminUsers: 0
    };
    
    return {
      totalUsers: current.totalUsers,
      activeUsers: current.activeUsers,
      adminUsers: current.adminUsers,
      newUsers,
      recentlyActive: activeUsers,
      userGrowthRate: await this.calculateUserGrowthRate(startDate, endDate)
    };
  }
  
  /**
   * Get order statistics
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   */
  static async getOrderStats(startDate, endDate) {
    const dateFilter = { date: { $gte: startDate, $lte: endDate } };
    
    const [ordersByStatus, deliveryStats, paymentStats] = await Promise.all([
      Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalValue: { $sum: '$total' }
          }
        }
      ]),
      Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$deliveryType',
            count: { $sum: 1 },
            totalFees: { $sum: '$deliveryFee' }
          }
        }
      ]),
      Order.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            totalValue: { $sum: '$total' }
          }
        }
      ])
    ]);
    
    const totalOrders = ordersByStatus.reduce((sum, item) => sum + item.count, 0);
    
    return {
      totalOrders,
      ordersByStatus: this.formatAggregateResults(ordersByStatus),
      deliveryStats: this.formatAggregateResults(deliveryStats),
      paymentStats: this.formatAggregateResults(paymentStats),
      fulfillmentRate: this.calculateFulfillmentRate(ordersByStatus)
    };
  }
  
  /**
   * Get top performing products
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {number} limit - Number of products to return
   */
  static async getTopProducts(startDate, endDate, limit = 10) {
    const topProducts = await Order.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          status: { $in: ['delivered', 'shipped', 'processing', 'confirmed'] }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          totalQuantitySold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' },
          orderCount: { $sum: 1 },
          averagePrice: { $avg: '$items.price' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: limit }
    ]);
    
    // Enrich with product details
    for (let item of topProducts) {
      const product = await Product.findById(item._id).select('category brand status stock_quantity');
      if (product) {
        item.category = product.category;
        item.brand = product.brand;
        item.status = product.status;
        item.currentStock = product.stock_quantity;
      }
    }
    
    return topProducts;
  }
  
  /**
   * Get top performing categories
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {number} limit - Number of categories to return
   */
  static async getTopCategories(startDate, endDate, limit = 5) {
    const topCategories = await Order.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          status: { $in: ['delivered', 'shipped', 'processing', 'confirmed'] }
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product.category',
          totalQuantitySold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' },
          orderCount: { $sum: 1 },
          uniqueProducts: { $addToSet: '$items.productId' }
        }
      },
      {
        $project: {
          category: '$_id',
          totalQuantitySold: 1,
          totalRevenue: 1,
          orderCount: 1,
          uniqueProductCount: { $size: '$uniqueProducts' },
          averageOrderValue: { $divide: ['$totalRevenue', '$orderCount'] }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: limit }
    ]);
    
    return topCategories;
  }
  
  /**
   * Get recent orders
   * @param {number} limit - Number of orders to return
   */
  static async getRecentOrders(limit = 10) {
    const recentOrders = await Order.find({})
      .sort({ date: -1 })
      .limit(limit)
      .select('orderNumber customerInfo.name total status date deliveryType')
      .lean();
    
    return recentOrders.map(order => ({
      orderNumber: order.orderNumber,
      customerName: order.customerInfo?.name || 'N/A',
      total: order.total,
      status: order.status,
      date: order.date,
      deliveryType: order.deliveryType
    }));
  }
  
  /**
   * Get sales trends over time
   * @param {string} period - Period (daily, weekly, monthly)
   * @param {Object} dateRange - Date range
   */
  static async getSalesTrends(period = 'daily', dateRange = {}) {
    const { startDate, endDate } = this.getDateRange(dateRange);
    
    let groupByDate = {};
    switch (period) {
      case 'weekly':
        groupByDate = {
          year: { $year: '$date' },
          week: { $week: '$date' }
        };
        break;
      case 'monthly':
        groupByDate = {
          year: { $year: '$date' },
          month: { $month: '$date' }
        };
        break;
      default: // daily
        groupByDate = {
          year: { $year: '$date' },
          month: { $month: '$date' },
          day: { $dayOfMonth: '$date' }
        };
    }
    
    const trends = await Order.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          status: { $in: ['delivered', 'shipped', 'processing', 'confirmed'] }
        }
      },
      {
        $group: {
          _id: groupByDate,
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
          averageOrderValue: { $avg: '$total' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } }
    ]);
    
    return trends.map(item => ({
      period: this.formatPeriodLabel(item._id, period),
      revenue: item.revenue,
      orders: item.orders,
      averageOrderValue: Math.round(item.averageOrderValue)
    }));
  }
  
  /**
   * Get customer insights
   * @param {Object} dateRange - Date range
   */
  static async getCustomerInsights(dateRange = {}) {
    const { startDate, endDate } = this.getDateRange(dateRange);
    
    const [customerSegments, repeatCustomers, topCustomers] = await Promise.all([
      this.getCustomerSegments(startDate, endDate),
      this.getRepeatCustomerRate(startDate, endDate),
      this.getTopCustomers(startDate, endDate, 10)
    ]);
    
    return {
      segments: customerSegments,
      repeatCustomerRate: repeatCustomers,
      topCustomers
    };
  }
  
  /**
   * Get inventory insights
   */
  static async getInventoryInsights() {
    const [stockLevels, turnoverRate, reorderPoints] = await Promise.all([
      this.getStockLevelDistribution(),
      this.getInventoryTurnoverRate(),
      this.getReorderPoints()
    ]);
    
    return {
      stockLevels,
      turnoverRate,
      reorderPoints
    };
  }
  
  /**
   * Helper methods
   */
  
  /**
   * Get date range with defaults
   * @param {Object} dateRange - Date range object
   */
  static getDateRange(dateRange = {}) {
    const endDate = dateRange.endDate || new Date();
    const startDate = dateRange.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    return { startDate, endDate };
  }
  
  /**
   * Calculate growth rate between current and previous periods
   * @param {number} current - Current value
   * @param {number} previous - Previous value
   */
  static calculateGrowthRate(current, previous) {
    if (!previous || previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }
  
  /**
   * Calculate conversion rate
   * @param {number} totalUsers - Total users
   * @param {number} totalOrders - Total orders
   */
  static calculateConversionRate(totalUsers, totalOrders) {
    if (!totalUsers || totalUsers === 0) return 0;
    return Math.round((totalOrders / totalUsers) * 100 * 100) / 100; // 2 decimal places
  }
  
  /**
   * Calculate fulfillment rate
   * @param {Array} ordersByStatus - Orders grouped by status
   */
  static calculateFulfillmentRate(ordersByStatus) {
    const totalOrders = ordersByStatus.reduce((sum, item) => sum + item.count, 0);
    const fulfilledOrders = ordersByStatus.filter(item => 
      ['delivered', 'shipped'].includes(item._id)
    ).reduce((sum, item) => sum + item.count, 0);
    
    return totalOrders > 0 ? Math.round((fulfilledOrders / totalOrders) * 100) : 0;
  }
  
  /**
   * Format aggregate results for consistent output
   * @param {Array} results - Aggregate results
   */
  static formatAggregateResults(results) {
    const formatted = {};
    results.forEach(item => {
      formatted[item._id] = {
        count: item.count,
        value: item.totalValue || item.totalFees || 0
      };
    });
    return formatted;
  }
  
  /**
   * Format period label based on grouping
   * @param {Object} period - Period object
   * @param {string} type - Period type
   */
  static formatPeriodLabel(period, type) {
    switch (type) {
      case 'weekly':
        return `${period.year}-W${period.week}`;
      case 'monthly':
        return `${period.year}-${String(period.month).padStart(2, '0')}`;
      default: // daily
        return `${period.year}-${String(period.month).padStart(2, '0')}-${String(period.day).padStart(2, '0')}`;
    }
  }
  
  /**
   * Get previous period sales for comparison
   * @param {Date} startDate - Current period start
   * @param {Date} endDate - Current period end
   */
  static async getPreviousPeriodSales(startDate, endDate) {
    const periodLength = endDate - startDate;
    const previousStart = new Date(startDate - periodLength);
    const previousEnd = new Date(endDate - periodLength);
    
    const previousData = await Order.aggregate([
      {
        $match: {
          date: { $gte: previousStart, $lte: previousEnd },
          status: { $in: ['delivered', 'shipped', 'processing', 'confirmed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 }
        }
      }
    ]);
    
    return previousData[0] || { totalRevenue: 0, totalOrders: 0 };
  }
  
  /**
   * Calculate user growth rate
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   */
  static async calculateUserGrowthRate(startDate, endDate) {
    const periodLength = endDate - startDate;
    const previousStart = new Date(startDate - periodLength);
    const previousEnd = new Date(endDate - periodLength);
    
    const [currentUsers, previousUsers] = await Promise.all([
      User.countDocuments({ date: { $gte: startDate, $lte: endDate } }),
      User.countDocuments({ date: { $gte: previousStart, $lte: previousEnd } })
    ]);
    
    return this.calculateGrowthRate(currentUsers, previousUsers);
  }
  
  /**
   * Get real-time metrics for dashboard
   */
  static async getRealtimeMetrics() {
    try {
      const cached = await cacheService.get('analytics:realtime:metrics');
      if (cached) {
        return cached;
      }
      
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const [activeOrders, hourlyOrders, dailyRevenue, pendingOrders, lowStockCount] = await Promise.all([
        Order.countDocuments({ status: { $in: ['confirmed', 'processing', 'shipped'] } }),
        Order.countDocuments({ date: { $gte: oneHourAgo }, status: { $ne: 'cancelled' } }),
        Order.aggregate([
          { $match: { date: { $gte: oneDayAgo }, status: { $ne: 'cancelled' } } },
          { $group: { _id: null, revenue: { $sum: '$total' } } }
        ]),
        Order.countDocuments({ status: 'pending' }),
        Product.countDocuments({ stock_quantity: { $lte: 10 }, status: 'active' })
      ]);
      
      const metrics = {
        activeOrders,
        hourlyOrders,
        dailyRevenue: dailyRevenue[0]?.revenue || 0,
        pendingOrders,
        lowStockCount,
        timestamp: now.toISOString(),
        serverUptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      };
      
      // Cache for 30 seconds
      await cacheService.set('analytics:realtime:metrics', metrics, 30);
      
      // Broadcast to connected admins
      websocketService.notifyAnalyticsUpdate(metrics);
      
      return metrics;
    } catch (error) {
      console.error('Error getting realtime metrics:', error);
      throw error;
    }
  }
  
  /**
   * Generate comprehensive report
   * @param {string} type - Report type (sales, inventory, customers)
   * @param {Object} options - Report options
   */
  static async generateReport(type, options = {}) {
    const { period = 'monthly', startDate, endDate, format = 'json' } = options;
    
    let reportData;
    switch (type) {
      case 'sales':
        reportData = await this.generateSalesReport(period, startDate, endDate);
        break;
      case 'inventory':
        reportData = await this.generateInventoryReport();
        break;
      case 'customers':
        reportData = await this.generateCustomerReport(period, startDate, endDate);
        break;
      default:
        throw new Error(`Unknown report type: ${type}`);
    }
    
    if (format === 'csv') {
      return this.convertToCSV(reportData, type);
    }
    
    return reportData;
  }
  
  /**
   * Generate sales report
   */
  static async generateSalesReport(period, startDate, endDate) {
    const { startDate: start, endDate: end } = this.getDateRange({ startDate, endDate });
    
    const [salesData, trends, topProducts, categoryBreakdown] = await Promise.all([
      this.getSalesStats(start, end),
      this.getSalesTrends(period, { startDate: start, endDate: end }),
      this.getTopProducts(start, end, 20),
      this.getTopCategories(start, end, 10)
    ]);
    
    return {
      type: 'sales',
      period,
      dateRange: { startDate: start, endDate: end },
      summary: salesData,
      trends,
      topProducts,
      categoryBreakdown,
      generatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Generate inventory report
   */
  static async generateInventoryReport() {
    const [stockLevels, lowStock, outOfStock, categoryStock, valueAnalysis] = await Promise.all([
      this.getStockLevelDistribution(),
      Product.find({ stock_quantity: { $lte: 10, $gt: 0 }, status: 'active' })
        .select('name brand category stock_quantity new_price')
        .lean(),
      Product.find({ stock_quantity: 0 })
        .select('name brand category new_price')
        .lean(),
      Product.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: '$category',
            totalProducts: { $sum: 1 },
            totalStock: { $sum: '$stock_quantity' },
            totalValue: { $sum: { $multiply: ['$stock_quantity', '$new_price'] } }
          }
        },
        { $sort: { totalValue: -1 } }
      ]),
      Product.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: null,
            totalValue: { $sum: { $multiply: ['$stock_quantity', '$new_price'] } },
            totalProducts: { $sum: 1 },
            totalStock: { $sum: '$stock_quantity' }
          }
        }
      ])
    ]);
    
    return {
      type: 'inventory',
      summary: valueAnalysis[0] || {},
      stockLevels,
      alerts: {
        lowStock: lowStock.length,
        outOfStock: outOfStock.length
      },
      lowStockProducts: lowStock,
      outOfStockProducts: outOfStock,
      categoryBreakdown: categoryStock,
      generatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Generate customer report
   */
  static async generateCustomerReport(period, startDate, endDate) {
    const { startDate: start, endDate: end } = this.getDateRange({ startDate, endDate });
    
    const [userStats, segments, repeatCustomers, topCustomers] = await Promise.all([
      this.getUserStats(start, end),
      this.getCustomerSegments(start, end),
      this.getRepeatCustomerRate(start, end),
      this.getTopCustomers(start, end, 20)
    ]);
    
    return {
      type: 'customers',
      period,
      dateRange: { startDate: start, endDate: end },
      summary: userStats,
      segments,
      repeatCustomerRate: repeatCustomers,
      topCustomers,
      generatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Convert data to CSV format
   */
  static convertToCSV(data, type) {
    // Basic CSV conversion - can be enhanced based on specific needs
    switch (type) {
      case 'sales':
        return this.convertSalesToCSV(data);
      case 'inventory':
        return this.convertInventoryToCSV(data);
      case 'customers':
        return this.convertCustomersToCSV(data);
      default:
        return JSON.stringify(data, null, 2);
    }
  }
  
  static convertSalesToCSV(data) {
    let csv = 'Date,Revenue,Orders,Average Order Value\n';
    data.trends.forEach(item => {
      csv += `${item.period},${item.revenue},${item.orders},${item.averageOrderValue}\n`;
    });
    return csv;
  }
  
  static convertInventoryToCSV(data) {
    let csv = 'Product Name,Category,Stock,Value\n';
    data.lowStockProducts.forEach(item => {
      csv += `${item.name},${item.category},${item.stock_quantity},${item.new_price * item.stock_quantity}\n`;
    });
    return csv;
  }
  
  static convertCustomersToCSV(data) {
    let csv = 'Customer,Total Spent,Orders Count,Average Order\n';
    data.topCustomers.forEach(item => {
      csv += `${item.customerName},${item.totalSpent},${item.orderCount},${item.averageOrder}\n`;
    });
    return csv;
  }
  
  /**
   * Enhanced implementation of placeholder methods
   */
  
  static async getCustomerSegments(startDate, endDate) {
    const segments = await Order.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: '$userId',
          totalSpent: { $sum: '$total' },
          orderCount: { $sum: 1 },
          lastOrderDate: { $max: '$date' }
        }
      },
      {
        $addFields: {
          segment: {
            $cond: {
              if: { $gte: ['$totalSpent', 1000] },
              then: 'VIP',
              else: {
                $cond: {
                  if: { $gte: ['$totalSpent', 500] },
                  then: 'Premium',
                  else: {
                    $cond: {
                      if: { $gte: ['$totalSpent', 100] },
                      then: 'Regular',
                      else: 'New'
                    }
                  }
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: '$segment',
          customerCount: { $sum: 1 },
          totalRevenue: { $sum: '$totalSpent' },
          avgSpending: { $avg: '$totalSpent' },
          avgOrders: { $avg: '$orderCount' }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);
    
    return segments.reduce((acc, segment) => {
      acc[segment._id] = {
        count: segment.customerCount,
        revenue: segment.totalRevenue,
        avgSpending: Math.round(segment.avgSpending),
        avgOrders: Math.round(segment.avgOrders * 100) / 100
      };
      return acc;
    }, {});
  }
  
  static async getRepeatCustomerRate(startDate, endDate) {
    const customerData = await Order.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: '$userId',
          orderCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          repeatCustomers: {
            $sum: { $cond: [{ $gt: ['$orderCount', 1] }, 1, 0] }
          }
        }
      }
    ]);
    
    const result = customerData[0];
    if (!result || result.totalCustomers === 0) return 0;
    
    return Math.round((result.repeatCustomers / result.totalCustomers) * 100);
  }
  
  static async getTopCustomers(startDate, endDate, limit = 10) {
    const topCustomers = await Order.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: '$userId',
          customerName: { $first: '$customerInfo.name' },
          totalSpent: { $sum: '$total' },
          orderCount: { $sum: 1 },
          lastOrderDate: { $max: '$date' }
        }
      },
      {
        $addFields: {
          averageOrder: { $divide: ['$totalSpent', '$orderCount'] }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: limit }
    ]);
    
    return topCustomers.map(customer => ({
      userId: customer._id,
      customerName: customer.customerName || 'Unknown',
      totalSpent: customer.totalSpent,
      orderCount: customer.orderCount,
      averageOrder: Math.round(customer.averageOrder),
      lastOrderDate: customer.lastOrderDate
    }));
  }
  
  static async getStockLevelDistribution() {
    const distribution = await Product.aggregate([
      { $match: { status: 'active' } },
      {
        $addFields: {
          stockLevel: {
            $cond: {
              if: { $eq: ['$stock_quantity', 0] },
              then: 'Out of Stock',
              else: {
                $cond: {
                  if: { $lte: ['$stock_quantity', 5] },
                  then: 'Critical',
                  else: {
                    $cond: {
                      if: { $lte: ['$stock_quantity', 10] },
                      then: 'Low',
                      else: {
                        $cond: {
                          if: { $lte: ['$stock_quantity', 50] },
                          then: 'Normal',
                          else: 'High'
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: '$stockLevel',
          count: { $sum: 1 },
          totalValue: { $sum: { $multiply: ['$stock_quantity', '$new_price'] } }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    return distribution.reduce((acc, level) => {
      acc[level._id] = {
        count: level.count,
        value: level.totalValue
      };
      return acc;
    }, {});
  }
  
  static async getInventoryTurnoverRate() {
    // Simplified calculation - would need cost of goods sold data for accurate calculation
    const [totalStock, soldLastMonth] = await Promise.all([
      Product.aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: null,
            totalStockValue: { $sum: { $multiply: ['$stock_quantity', '$new_price'] } }
          }
        }
      ]),
      Order.aggregate([
        {
          $match: {
            date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            status: { $ne: 'cancelled' }
          }
        },
        {
          $group: {
            _id: null,
            totalSold: { $sum: '$total' }
          }
        }
      ])
    ]);
    
    const stockValue = totalStock[0]?.totalStockValue || 1;
    const soldValue = soldLastMonth[0]?.totalSold || 0;
    
    return stockValue > 0 ? Math.round((soldValue / stockValue) * 12 * 100) / 100 : 0; // Annualized
  }
  
  static async getReorderPoints() {
    // Products that need reordering based on stock levels and sales velocity
    const reorderProducts = await Product.aggregate([
      { $match: { stock_quantity: { $lte: 10 }, status: 'active' } },
      {
        $lookup: {
          from: 'orders',
          let: { productId: '$_id' },
          pipeline: [
            { $unwind: '$items' },
            { $match: { $expr: { $eq: ['$items.productId', '$$productId'] } } },
            {
              $match: {
                date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                status: { $ne: 'cancelled' }
              }
            },
            {
              $group: {
                _id: null,
                totalSold: { $sum: '$items.quantity' }
              }
            }
          ],
          as: 'salesData'
        }
      },
      {
        $addFields: {
          monthlySales: { $ifNull: [{ $arrayElemAt: ['$salesData.totalSold', 0] }, 0] },
          daysOfStock: {
            $cond: {
              if: { $gt: [{ $arrayElemAt: ['$salesData.totalSold', 0] }, 0] },
              then: {
                $multiply: [
                  { $divide: ['$stock_quantity', { $arrayElemAt: ['$salesData.totalSold', 0] }] },
                  30
                ]
              },
              else: 999
            }
          }
        }
      },
      {
        $project: {
          name: 1,
          category: 1,
          brand: 1,
          stock_quantity: 1,
          new_price: 1,
          monthlySales: 1,
          daysOfStock: 1,
          priority: {
            $cond: {
              if: { $lte: ['$daysOfStock', 7] },
              then: 'High',
              else: {
                $cond: {
                  if: { $lte: ['$daysOfStock', 14] },
                  then: 'Medium',
                  else: 'Low'
                }
              }
            }
          }
        }
      },
      { $sort: { daysOfStock: 1 } },
      { $limit: 50 }
    ]);
    
    return reorderProducts;
  }
  
  /**
   * Analytics caching methods
   */
  
  static async clearAnalyticsCache(pattern) {
    if (cacheService) {
      await cacheService.deletePattern(pattern || 'analytics:*');
    }
  }
  
  static async getCachedAnalytics(key, fallbackFn, ttl = 3600) {
    if (!cacheService) {
      return await fallbackFn();
    }
    
    return await cacheService.cacheFetch(key, fallbackFn, ttl);
  }
}

// Export singleton instance
module.exports = new AnalyticsService();
