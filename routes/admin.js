const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAdminAuth } = require('../middleware/adminAuth');

// Test route without authentication to debug
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Admin test route working',
    timestamp: new Date().toISOString()
  });
});

// Apply admin authentication to all other routes
router.use(requireAdminAuth);

// Simple data access helpers without model redefinition
const getProductModel = () => {
  try {
    return mongoose.model('Product');
  } catch {
    return null;
  }
};

const getUserModel = () => {
  try {
    return mongoose.model('Users');
  } catch {
    return null;
  }
};

// Additional model getters
const getOrderModel = () => {
  try {
    return mongoose.model('Order');
  } catch {
    return null;
  }
};

const getDeliveryFeeModel = () => {
  try {
    return mongoose.model('DeliveryFee');
  } catch {
    return null;
  }
};

const getShopImageModel = () => {
  try {
    return mongoose.model('ShopImage');
  } catch {
    return null;
  }
};

// Simple async handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Dashboard Analytics Routes
 */

// Get comprehensive dashboard statistics
router.get('/dashboard/stats', asyncHandler(async (req, res) => {
  try {
    const Product = getProductModel();
    const Users = getUserModel();
    
    if (!Product || !Users) {
      return res.status(503).json({
        success: false,
        error: 'Database models not available'
      });
    }
    
    // Get basic stats from database
    const [totalProducts, totalUsers] = await Promise.all([
      Product.countDocuments({}),
      Users.countDocuments({})
    ]);
    
    const stats = {
      totalProducts,
      totalCustomers: totalUsers,
      totalOrders: 0, // Mock value since Order model might not exist
      totalRevenue: 0, // Mock value
      activeProducts: await Product.countDocuments({ available: true }),
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics'
    });
  }
}));

// Get recent orders
router.get('/orders/recent', asyncHandler(async (req, res) => {
  try {
    // Return mock data since Order model might not exist
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent orders'
    });
  }
}));

// Get all products with pagination
router.get('/products', asyncHandler(async (req, res) => {
  try {
    const Product = getProductModel();
    if (!Product) {
      return res.status(503).json({
        success: false,
        error: 'Product model not available'
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const products = await Product.find({})
      .skip(skip)
      .limit(limit)
      .sort({ date: -1 })
      .lean();
    
    const total = await Product.countDocuments({});
    
    res.json({
      success: true,
      data: {
        products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products'
    });
  }
}));

// Get all users with pagination
router.get('/users', asyncHandler(async (req, res) => {
  try {
    const Users = getUserModel();
    if (!Users) {
      return res.status(503).json({
        success: false,
        error: 'Users model not available'
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const users = await Users.find({})
      .select('-password -cartData') // Exclude sensitive data
      .skip(skip)
      .limit(limit)
      .sort({ date: -1 })
      .lean();
    
    const total = await Users.countDocuments({});
    
    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
}));

// Update product
router.put('/products/:id', asyncHandler(async (req, res) => {
  try {
    const Product = getProductModel();
    if (!Product) {
      return res.status(503).json({
        success: false,
        error: 'Product model not available'
      });
    }
    
    const productId = req.params.id;
    const updateData = req.body;
    
    const product = await Product.findOneAndUpdate(
      { id: productId },
      updateData,
      { new: true }
    );
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update product'
    });
  }
}));

// Delete product
router.delete('/products/:id', asyncHandler(async (req, res) => {
  try {
    const Product = getProductModel();
    if (!Product) {
      return res.status(503).json({
        success: false,
        error: 'Product model not available'
      });
    }
    
    const productId = req.params.id;
    
    const product = await Product.findOneAndDelete({ id: productId });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete product'
    });
  }
}));

// Get system health
router.get('/system/health', asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState
      }
    },
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '2.0.1'
  };
  
  res.json({
    success: true,
    data: health
  });
}));

/**
 * Missing admin endpoints used by the admin panel
 */

// Sales trends (aggregated orders by day over a given range)
router.get('/sales-trends', asyncHandler(async (req, res) => {
  const Order = getOrderModel();
  if (!Order) {
    return res.status(503).json({ success: false, error: 'Order model not available' });
  }

  const range = (req.query.range || '30d').toLowerCase(); // '7d' | '30d' | '12m'
  const now = new Date();
  let startDate = new Date(now);
  if (range === '7d') startDate.setDate(now.getDate() - 7);
  else if (range === '12m') startDate.setMonth(now.getMonth() - 12);
  else startDate.setDate(now.getDate() - 30);

  const series = await Order.aggregate([
    { $match: { date: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        orders: { $sum: 1 },
        revenue: { $sum: { $ifNull: ['$total', 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json({
    success: true,
    range,
    interval: 'day',
    series: series.map(d => ({ date: d._id, orders: d.orders, revenue: d.revenue }))
  });
}));

// Customers listing (alias of users but under /customers)
router.get('/customers', asyncHandler(async (req, res) => {
  const Users = getUserModel();
  if (!Users) {
    return res.status(503).json({ success: false, error: 'Users model not available' });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const search = (req.query.search || '').trim();

  const filter = search
    ? {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }
    : {};

  const [customers, total] = await Promise.all([
    Users.find(filter)
      .select('-password -cartData')
      .skip(skip)
      .limit(limit)
      .sort({ date: -1 })
      .lean(),
    Users.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: {
      customers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// Inventory summary
router.get('/inventory', asyncHandler(async (req, res) => {
  const Product = getProductModel();
  if (!Product) {
    return res.status(503).json({ success: false, error: 'Product model not available' });
  }

  const lowStockThreshold = parseInt(req.query.lowStockThreshold) || 5;

  const [totalProducts, activeProducts, outOfStock, lowStockCount, byCategory, lowStockProducts] = await Promise.all([
    Product.countDocuments({}),
    Product.countDocuments({ status: 'active' }),
    Product.countDocuments({ $or: [{ stock_quantity: { $lte: 0 } }, { avilable: false }] }),
    Product.countDocuments({ stock_quantity: { $gt: 0, $lte: lowStockThreshold } }),
    Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Product.find({ stock_quantity: { $gt: 0, $lte: lowStockThreshold } })
      .select('id name stock_quantity category')
      .sort({ stock_quantity: 1 })
      .limit(20)
      .lean()
  ]);

  res.json({
    success: true,
    data: {
      summary: {
        totalProducts,
        activeProducts,
        outOfStock,
        lowStockCount,
        lowStockThreshold
      },
      byCategory: byCategory.map(c => ({ category: c._id || 'Uncategorized', count: c.count })),
      lowStockProducts
    }
  });
}));

// Delivery rates list (admin)
router.get('/deliveryrates', asyncHandler(async (req, res) => {
  const DeliveryFee = getDeliveryFeeModel();
  if (!DeliveryFee) {
    return res.status(503).json({ success: false, error: 'DeliveryFee model not available' });
  }

  const { wilaya, commune, deliveryType } = req.query;
  const filter = {};
  if (wilaya) filter.wilaya = wilaya;
  if (commune) filter.commune = commune;
  if (deliveryType) filter.deliveryType = deliveryType;

  const rates = await DeliveryFee.find(filter).sort({ wilaya: 1, commune: 1 }).lean();
  // Return both keys for compatibility
  res.json({ success: true, rates, data: rates });
}));

// Shop images list (admin)
router.get('/shop-images', asyncHandler(async (req, res) => {
  const ShopImage = getShopImageModel();
  if (!ShopImage) {
    return res.status(503).json({ success: false, error: 'ShopImage model not available' });
  }

  const { type, visible, category } = req.query;
  const filter = {};
  if (type) filter.imageType = type;
  if (category) filter.category = category;
  if (visible !== undefined) filter.visible = visible === 'true';

  const images = await ShopImage.find(filter).sort({ imageType: 1, order: 1 }).lean();
  // Return both keys for compatibility with various admin UIs
  res.json({ success: true, images, data: images });
}));

// Notifications settings (admin)
router.get('/notifications', asyncHandler(async (req, res) => {
  const notificationSettings = {
    lowStockAlerts: true,
    orderConfirmations: true,
    welcomeEmails: true,
    marketingEmails: false,
    adminAlerts: true,
    emailProvider: process.env.EMAIL_PROVIDER || 'not_configured',
    lastTest: null
  };

  res.json({ success: true, settings: notificationSettings });
}));

module.exports = router;
