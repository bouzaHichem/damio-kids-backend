const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../utils/auth');
const AnalyticsService = require('../services/analyticsService');
const InventoryService = require('../services/inventoryService');
const EmailService = require('../services/emailService');
const { queryValidation, idValidation } = require('../middleware/validation');

// Apply admin authentication to all routes
router.use(requireAdmin);

/**
 * Dashboard Analytics Routes
 */

// Get comprehensive dashboard statistics
router.get('/dashboard/stats', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const dateRange = {};
  if (startDate) dateRange.startDate = new Date(startDate);
  if (endDate) dateRange.endDate = new Date(endDate);
  
  const stats = await AnalyticsService.getDashboardStats(dateRange);
  
  res.json({
    success: true,
    data: stats
  });
}));

// Get sales trends
router.get('/analytics/sales-trends', asyncHandler(async (req, res) => {
  const { period = 'daily', startDate, endDate } = req.query;
  
  const dateRange = {};
  if (startDate) dateRange.startDate = new Date(startDate);
  if (endDate) dateRange.endDate = new Date(endDate);
  
  const trends = await AnalyticsService.getSalesTrends(period, dateRange);
  
  res.json({
    success: true,
    data: {
      trends,
      period,
      dateRange
    }
  });
}));

// Get customer insights
router.get('/analytics/customers', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  const dateRange = {};
  if (startDate) dateRange.startDate = new Date(startDate);
  if (endDate) dateRange.endDate = new Date(endDate);
  
  const insights = await AnalyticsService.getCustomerInsights(dateRange);
  
  res.json({
    success: true,
    data: insights
  });
}));

// Get inventory insights
router.get('/analytics/inventory', asyncHandler(async (req, res) => {
  const insights = await AnalyticsService.getInventoryInsights();
  
  res.json({
    success: true,
    data: insights
  });
}));

/**
 * Inventory Management Routes
 */

// Get inventory report
router.get('/inventory/report', asyncHandler(async (req, res) => {
  const filters = {
    category: req.query.category,
    brand: req.query.brand,
    status: req.query.status,
    lowStock: req.query.lowStock === 'true',
    outOfStock: req.query.outOfStock === 'true'
  };
  
  const report = await InventoryService.getInventoryReport(filters);
  
  res.json({
    success: true,
    data: report
  });
}));

// Get low stock products
router.get('/inventory/low-stock', asyncHandler(async (req, res) => {
  const threshold = req.query.threshold ? parseInt(req.query.threshold) : null;
  const lowStockProducts = await InventoryService.getLowStockProducts(threshold);
  
  res.json({
    success: true,
    data: {
      products: lowStockProducts,
      count: lowStockProducts.length,
      threshold
    }
  });
}));

// Get out of stock products
router.get('/inventory/out-of-stock', asyncHandler(async (req, res) => {
  const outOfStockProducts = await InventoryService.getOutOfStockProducts();
  
  res.json({
    success: true,
    data: {
      products: outOfStockProducts,
      count: outOfStockProducts.length
    }
  });
}));

// Update stock for a product
router.post('/inventory/update-stock', asyncHandler(async (req, res) => {
  const { productId, quantity, reason = 'manual_adjustment' } = req.body;
  
  if (!productId || quantity === undefined) {
    return res.status(400).json({
      success: false,
      error: 'Product ID and quantity are required'
    });
  }
  
  const result = await InventoryService.updateStock(
    productId,
    parseInt(quantity),
    reason,
    req.user.id
  );
  
  res.json({
    success: true,
    data: result
  });
}));

// Bulk stock update
router.post('/inventory/bulk-update', asyncHandler(async (req, res) => {
  const { updates } = req.body;
  
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Updates array is required'
    });
  }
  
  const result = await InventoryService.bulkStockUpdate(updates, req.user.id);
  
  res.json({
    success: true,
    data: result
  });
}));

// Reserve stock for order
router.post('/inventory/reserve-stock', asyncHandler(async (req, res) => {
  const { orderItems, orderId } = req.body;
  
  if (!Array.isArray(orderItems) || !orderId) {
    return res.status(400).json({
      success: false,
      error: 'Order items and order ID are required'
    });
  }
  
  const reservations = await InventoryService.reserveStock(orderItems, orderId);
  
  res.json({
    success: true,
    data: {
      reservations,
      orderId,
      totalItems: orderItems.length
    }
  });
}));

// Release reserved stock
router.post('/inventory/release-stock', asyncHandler(async (req, res) => {
  const { orderItems, orderId } = req.body;
  
  if (!Array.isArray(orderItems) || !orderId) {
    return res.status(400).json({
      success: false,
      error: 'Order items and order ID are required'
    });
  }
  
  const releases = await InventoryService.releaseReservedStock(orderItems, orderId);
  
  res.json({
    success: true,
    data: {
      releases,
      orderId,
      totalItems: orderItems.length
    }
  });
}));

// Get stock movement history
router.get('/inventory/movements', queryValidation.pagination, asyncHandler(async (req, res) => {
  const filters = {
    productId: req.query.productId,
    startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
    endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
    reason: req.query.reason,
    page: req.query.page,
    limit: req.query.limit
  };
  
  const history = await InventoryService.getStockMovementHistory(filters);
  
  res.json({
    success: true,
    data: history
  });
}));

/**
 * Email and Notification Management
 */

// Send test email
router.post('/notifications/test-email', asyncHandler(async (req, res) => {
  const { to, subject = 'Test Email from Damio Kids Admin' } = req.body;
  
  if (!to) {
    return res.status(400).json({
      success: false,
      error: 'Recipient email is required'
    });
  }
  
  const result = await EmailService.sendEmail({
    to,
    subject,
    html: `
      <h2>Test Email</h2>
      <p>This is a test email sent from the Damio Kids admin panel.</p>
      <p>Timestamp: ${new Date().toISOString()}</p>
      <p>Sent by: ${req.user.email || 'Admin'}</p>
    `
  });
  
  res.json({
    success: true,
    data: result
  });
}));

// Send low stock alert manually
router.post('/notifications/low-stock-alert', asyncHandler(async (req, res) => {
  const { productId } = req.body;
  
  if (!productId) {
    return res.status(400).json({
      success: false,
      error: 'Product ID is required'
    });
  }
  
  // Get product details
  const { Product } = require('../models');
  const product = await Product.findOne({ id: productId });
  
  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }
  
  const result = await EmailService.sendLowStockAlert(product);
  
  res.json({
    success: true,
    data: result
  });
}));

/**
 * System Health and Monitoring
 */

// Get system health status
router.get('/system/health', asyncHandler(async (req, res) => {
  const mongoose = require('mongoose');
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState
      },
      email: {
        status: EmailService.transporter ? 'configured' : 'not_configured'
      }
    },
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '2.0.0'
  };
  
  // Check if any critical services are down
  if (health.services.database.status !== 'connected') {
    health.status = 'unhealthy';
  }
  
  res.json({
    success: true,
    data: health
  });
}));

// Get system logs (mock implementation)
router.get('/system/logs', queryValidation.pagination, asyncHandler(async (req, res) => {
  const { level = 'all', page = 1, limit = 50 } = req.query;
  
  // In production, this would fetch actual logs
  const mockLogs = [
    {
      id: 1,
      timestamp: new Date(),
      level: 'info',
      message: 'Server started successfully',
      module: 'server'
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      level: 'warn',
      message: 'Low stock alert triggered for product ID 123',
      module: 'inventory'
    },
    {
      id: 3,
      timestamp: new Date(Date.now() - 1000 * 60 * 10),
      level: 'error',
      message: 'Email send failed for order confirmation',
      module: 'email'
    }
  ];
  
  res.json({
    success: true,
    data: {
      logs: mockLogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: 1,
        totalLogs: mockLogs.length
      }
    }
  });
}));

// Clear cache (if implemented)
router.post('/system/clear-cache', asyncHandler(async (req, res) => {
  // In production, this would clear application caches
  console.log('Cache clear requested by admin:', req.user.email);
  
  res.json({
    success: true,
    message: 'Cache cleared successfully',
    timestamp: new Date().toISOString()
  });
}));

/**
 * Export Data Routes
 */

// Export products to CSV
router.get('/export/products', asyncHandler(async (req, res) => {
  const { Product } = require('../models');
  
  const products = await Product.find({})
    .select('id name category brand new_price old_price stock_quantity status')
    .lean();
  
  // Convert to CSV format
  const csvHeader = 'ID,Name,Category,Brand,Price,Old Price,Stock,Status\n';
  const csvData = products.map(product => 
    `${product.id},"${product.name}","${product.category}","${product.brand || ''}",${product.new_price},${product.old_price || ''},${product.stock_quantity},"${product.status}"`
  ).join('\n');
  
  const csv = csvHeader + csvData;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="products-export.csv"');
  res.send(csv);
}));

// Export orders to CSV
router.get('/export/orders', asyncHandler(async (req, res) => {
  const { Order } = require('../models');
  const { startDate, endDate } = req.query;
  
  let dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);
  
  const query = Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {};
  
  const orders = await Order.find(query)
    .select('orderNumber customerInfo.name customerInfo.email total status date deliveryType')
    .lean();
  
  // Convert to CSV format
  const csvHeader = 'Order Number,Customer Name,Email,Total,Status,Date,Delivery Type\n';
  const csvData = orders.map(order => 
    `"${order.orderNumber}","${order.customerInfo?.name || ''}","${order.customerInfo?.email || ''}",${order.total},"${order.status}","${order.date?.toISOString() || ''}","${order.deliveryType}"`
  ).join('\n');
  
  const csv = csvHeader + csvData;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="orders-export-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
}));

module.exports = router;
