const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Admin authentication middleware
const requireAdminAuth = async (req, res, next) => {
  try {
    console.log('🔐 Admin authentication middleware triggered for:', req.path);
    
    let token = null;
    
    // 1. Try to get token from Authorization header (Bearer format)
    const authHeader = req.header('Authorization') || req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
      console.log('✅ Admin token extracted from Bearer Authorization header');
    }
    
    // 2. Fallback to auth-token header (backward compatibility)
    if (!token) {
      token = req.header('auth-token');
      if (token) {
        console.log('✅ Admin token found in auth-token header');
      }
    }
    
    // 3. Try to get token from cookies
    if (!token && req.cookies && req.cookies.adminToken) {
      token = req.cookies.adminToken;
      console.log('✅ Admin token found in cookies');
    }
    
    if (!token) {
      console.log('❌ No admin token provided in request');
      return res.status(401).json({
        success: false,
        message: 'Access denied. Admin authentication required.',
        code: 'NO_TOKEN'
      });
    }
    
    // Clean the token
    token = token.trim().replace(/^"|"$/g, '');
    console.log('🔑 Admin token processed - length:', token.length);
    
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
    
    // Verify the token
    try {
      console.log('🔓 Verifying admin JWT token...');
      const decoded = jwt.verify(token, jwtSecret);
      
      // Ensure the token has the expected structure for admin
      if (!decoded.adminId || decoded.type !== 'admin') {
        console.error('❌ Invalid admin token structure:', decoded);
        return res.status(401).json({
          success: false,
          message: 'Invalid admin token format',
          code: 'INVALID_TOKEN_FORMAT'
        });
      }
      
      // Find the admin in database
      console.log('🔍 Looking up admin in database:', decoded.adminId);
      const admin = await Admin.findById(decoded.adminId).select('+password');
      
      if (!admin) {
        console.error('❌ Admin not found in database:', decoded.adminId);
        return res.status(401).json({
          success: false,
          message: 'Admin account not found',
          code: 'ADMIN_NOT_FOUND'
        });
      }
      
      // Check if admin account is active
      if (!admin.isActive) {
        console.error('❌ Admin account is deactivated:', admin.email);
        return res.status(401).json({
          success: false,
          message: 'Admin account is deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }
      
      // Check if admin account is locked
      if (admin.isLocked()) {
        console.error('❌ Admin account is locked:', admin.email);
        return res.status(401).json({
          success: false,
          message: 'Admin account is locked due to multiple failed login attempts',
          code: 'ACCOUNT_LOCKED'
        });
      }
      
      // Attach admin info to request (without password)
      req.admin = admin.getPublicProfile();
      req.adminId = admin._id;
      req.adminRole = admin.role;
      req.adminPermissions = admin.permissions;
      
      console.log('✅ Admin authenticated:', admin.email, 'role:', admin.role);
      next();
      
    } catch (error) {
      console.error('❌ Admin token verification error:', {
        name: error.name,
        message: error.message
      });
      
      let errorMessage = 'Invalid or expired admin token';
      let errorCode = 'INVALID_TOKEN';
      
      if (error.name === 'TokenExpiredError') {
        errorMessage = 'Admin token has expired, please login again';
        errorCode = 'TOKEN_EXPIRED';
      } else if (error.name === 'JsonWebTokenError') {
        if (error.message.includes('jwt malformed')) {
          errorMessage = 'Malformed admin token';
          errorCode = 'MALFORMED_TOKEN';
        } else {
          errorMessage = 'Invalid admin token';
          errorCode = 'INVALID_TOKEN';
        }
      } else if (error.name === 'NotBeforeError') {
        errorMessage = 'Admin token not active yet';
        errorCode = 'TOKEN_NOT_ACTIVE';
      }
      
      return res.status(401).json({
        success: false,
        message: errorMessage,
        code: errorCode
      });
    }
    
  } catch (error) {
    console.error('❌ Admin authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during admin authentication',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Check specific admin permissions
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required',
        code: 'NO_ADMIN_AUTH'
      });
    }
    
    // Super admin has all permissions
    if (req.adminRole === 'super_admin') {
      return next();
    }
    
    // Check if admin has the required permission
    if (!req.adminPermissions.includes(permission)) {
      console.log(`❌ Admin ${req.admin.email} lacks permission: ${permission}`);
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permission: ${permission}`,
        code: 'INSUFFICIENT_PERMISSIONS',
        required: permission,
        current: req.adminPermissions
      });
    }
    
    console.log(`✅ Admin ${req.admin.email} has permission: ${permission}`);
    next();
  };
};

// Check specific admin role
const requireRole = (roles) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required',
        code: 'NO_ADMIN_AUTH'
      });
    }
    
    if (!allowedRoles.includes(req.adminRole)) {
      console.log(`❌ Admin ${req.admin.email} has insufficient role: ${req.adminRole}`);
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        code: 'INSUFFICIENT_ROLE',
        required: allowedRoles,
        current: req.adminRole
      });
    }
    
    console.log(`✅ Admin ${req.admin.email} has required role: ${req.adminRole}`);
    next();
  };
};

// Check if admin is super admin
const requireSuperAdmin = requireRole('super_admin');

module.exports = {
  requireAdminAuth,
  requirePermission,
  requireRole,
  requireSuperAdmin
};
