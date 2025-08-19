const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Admin = require('../models/Admin');
const { requireAdminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// Rate limiting for admin login attempts
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: {
    success: false,
    message: 'Too many admin login attempts from this IP, please try again later.',
    retryAfter: '15 minutes',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Admin Login Route
router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    console.log('🔐 Admin login attempt for:', req.body.email);
    
    const { email, password } = req.body;
    
    // Basic validation
    if (!email || !password) {
      console.log('❌ Admin login failed: Missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }
    
    // Validate email format
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Admin login failed: Invalid email format');
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
        code: 'INVALID_EMAIL_FORMAT'
      });
    }
    
    // Find admin by email (include password for authentication)
    const admin = await Admin.findOne({ email: email.toLowerCase().trim() }).select('+password');
    
    if (!admin) {
      console.log('❌ Admin login failed: Admin not found -', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Check if account is locked
    if (admin.isLocked()) {
      console.log('❌ Admin login failed: Account is locked -', email);
      return res.status(401).json({
        success: false,
        message: 'Account is locked due to multiple failed login attempts. Please try again later.',
        code: 'ACCOUNT_LOCKED'
      });
    }
    
    // Check if admin account is active
    if (!admin.isActive) {
      console.log('❌ Admin login failed: Account is deactivated -', email);
      return res.status(401).json({
        success: false,
        message: 'Admin account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }
    
    // Verify password
    const isPasswordValid = await admin.comparePassword(password);
    
    if (!isPasswordValid) {
      console.log('❌ Admin login failed: Invalid password -', email);
      
      // Increment failed login attempts
      await admin.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    // Reset login attempts on successful login
    if (admin.loginAttempts > 0) {
      await admin.resetLoginAttempts();
    } else {
      // Just update last login if no previous failed attempts
      admin.lastLogin = new Date();
      await admin.save();
    }
    
    // Validate JWT_SECRET exists
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('❌ JWT_SECRET environment variable is not defined');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
        code: 'SERVER_CONFIG_ERROR'
      });
    }
    
    // Generate JWT token with admin-specific payload
    const tokenPayload = {
      adminId: admin._id,
      email: admin.email,
      role: admin.role,
      type: 'admin', // Distinguish from regular user tokens
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    };
    
    const token = jwt.sign(tokenPayload, jwtSecret);
    
    console.log('✅ Admin login successful:', admin.email, 'role:', admin.role);
    
    // Prepare response
    const adminProfile = admin.getPublicProfile();
    
    // Set secure HTTP-only cookie (recommended for production)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/admin'
    });
    
    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      admin: adminProfile,
      token, // Also return token for localStorage if needed
      expiresIn: '24h'
    });
    
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin login',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Admin Logout Route
router.post('/logout', requireAdminAuth, async (req, res) => {
  try {
    console.log('🚪 Admin logout:', req.admin.email);
    
    // Clear the HTTP-only cookie
    res.clearCookie('adminToken', {
      path: '/admin',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
    });
    
    // In a more advanced implementation, you could:
    // 1. Add the token to a blacklist in Redis
    // 2. Store logout timestamp in admin record
    // 3. Implement token versioning
    
    console.log('✅ Admin logout successful:', req.admin.email);
    
    res.status(200).json({
      success: true,
      message: 'Admin logout successful'
    });
    
  } catch (error) {
    console.error('❌ Admin logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin logout',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Get current admin profile
router.get('/profile', requireAdminAuth, async (req, res) => {
  try {
    console.log('👤 Admin profile request:', req.admin.email);
    
    // Get fresh admin data from database
    const admin = await Admin.findById(req.adminId);
    
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Admin account not found or deactivated',
        code: 'ADMIN_NOT_FOUND'
      });
    }
    
    res.status(200).json({
      success: true,
      admin: admin.getPublicProfile()
    });
    
  } catch (error) {
    console.error('❌ Admin profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Refresh admin token
router.post('/refresh', requireAdminAuth, async (req, res) => {
  try {
    console.log('🔄 Admin token refresh:', req.admin.email);
    
    // Get fresh admin data from database
    const admin = await Admin.findById(req.adminId);
    
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Admin account not found or deactivated',
        code: 'ADMIN_NOT_FOUND'
      });
    }
    
    // Generate new JWT token
    const jwtSecret = process.env.JWT_SECRET;
    const tokenPayload = {
      adminId: admin._id,
      email: admin.email,
      role: admin.role,
      type: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    };
    
    const token = jwt.sign(tokenPayload, jwtSecret);
    
    // Set new cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/admin'
    });
    
    console.log('✅ Admin token refreshed:', admin.email);
    
    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      admin: admin.getPublicProfile(),
      token,
      expiresIn: '24h'
    });
    
  } catch (error) {
    console.error('❌ Admin token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during token refresh',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Verify admin token (for client-side token validation)
router.get('/verify', requireAdminAuth, async (req, res) => {
  try {
    console.log('✅ Admin token verification successful:', req.admin.email);
    
    res.status(200).json({
      success: true,
      message: 'Admin token is valid',
      admin: req.admin,
      permissions: req.adminPermissions,
      role: req.adminRole
    });
    
  } catch (error) {
    console.error('❌ Admin token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during token verification',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;
