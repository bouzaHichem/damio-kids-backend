const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAdminAuth } = require('../middleware/adminAuth');

// Apply admin authentication to all routes
router.use(requireAdminAuth);

// Get existing models instead of creating new ones
const Product = mongoose.model('Product');
const Users = mongoose.model('Users');

// Check if Order model exists, if not create a simple one
let Order;
try {
  Order = mongoose.model('Order');
} catch (error) {
  const OrderSchema = new mongoose.Schema({
    userId: String,
    items: Array,
    total: Number,
    address: Object,
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
  });
  Order = mongoose.model('Order', OrderSchema);
}

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
    // Get basic stats from database
    const [totalProducts, totalUsers, totalOrders] = await Promise.all([
      Product.countDocuments({}),
      Users.countDocuments({}),
      Order.countDocuments({})
    ]);
    
    // Get recent orders total
    const recentOrdersTotal = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    
    const stats = {
      products: {
        total: totalProducts,
        active: await Product.countDocuments({ status: 'active' })
      },
      users: {
        total: totalUsers,
        active: await Users.countDocuments({ isActive: true })
      },
      orders: {
        total: totalOrders,
        revenue: recentOrdersTotal.length > 0 ? recentOrdersTotal[0].total : 0
      },
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
    const limit = parseInt(req.query.limit) || 10;
    const orders = await Order.find({})
      .sort({ date: -1 })
      .limit(limit)
      .lean();
    
    res.json({
      success: true,
      data: orders
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

module.exports = router;
