// Improved JWT authentication middleware
const jwt = require('jsonwebtoken');

const fetchuser = async (req, res, next) => {
  try {
    let token = null;
    
    // Try to get token from auth-token header first (your current implementation)
    token = req.header('auth-token');
    
    // If not found, try Authorization header with Bearer format
    if (!token) {
      const authHeader = req.header('Authorization') || req.headers.authorization;
      if (authHeader) {
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7); // Remove 'Bearer ' prefix
        } else if (authHeader.startsWith('auth-token ')) {
          token = authHeader.substring(11); // Remove 'auth-token ' prefix
        } else {
          // Sometimes the token might be sent without Bearer prefix
          token = authHeader;
        }
      }
    }
    
    // Try to get token from cookies as fallback
    if (!token && req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
    }
    
    // Check for token in request body (for some edge cases)
    if (!token && req.body && req.body.token) {
      token = req.body.token;
    }
    
    if (!token) {
      console.log('No token provided in request');
      return res.status(401).json({
        success: false,
        errors: 'Please authenticate using a valid token'
      });
    }
    
    // Clean the token (remove any extra whitespace or quotes)
    token = token.trim().replace(/^"|"$/g, '');
    
    // Validate JWT_SECRET exists
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is not defined');
      return res.status(500).json({
        success: false,
        errors: 'Server configuration error'
      });
    }
    
    // Verify the token
    try {
      const data = jwt.verify(token, jwtSecret);
      
      // Ensure the token has the expected structure
      if (!data.user || !data.user.id) {
        console.error('Token verification failed: Invalid token structure');
        return res.status(401).json({
          success: false,
          errors: 'Invalid token format'
        });
      }
      
      req.user = data.user;
      console.log(User authenticated:  with role: );
      next();
    } catch (error) {
      console.error('Token verification error:', error.message);
      
      // Provide more specific error messages
      let errorMessage = 'Invalid or expired token';
      
      if (error.name === 'TokenExpiredError') {
        errorMessage = 'Token has expired, please login again';
      } else if (error.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token format';
      } else if (error.name === 'NotBeforeError') {
        errorMessage = 'Token not active yet';
      }
      
      return res.status(401).json({
        success: false,
        errors: errorMessage
      });
    }
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      errors: 'Internal server error during authentication'
    });
  }
};

// Optional: Admin role check middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      errors: 'Authentication required'
    });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      errors: 'Admin access required'
    });
  }
  
  next();
};

module.exports = { fetchuser, requireAdmin };
