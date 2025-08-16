# Damio Kids Backend - Production Deployment Guide

## Issues Fixed

### 1. CORS Configuration Issues
- ? Fixed 'origin undefined' errors
- ? Added support for dynamic Vercel domain detection
- ? Proper handling of both production and preview URLs
- ? Added better logging for CORS debugging

### 2. JWT Authentication Issues
- ? Fixed 'jwt malformed' errors
- ? Improved token extraction from multiple sources
- ? Added proper token validation and error handling
- ? Added token expiration (24h)

### 3. Route Configuration
- ? Added proper error handling
- ? Added 404 handler for unknown routes
- ? Improved request logging

## Environment Variables Required on Render

Set these in your Render dashboard under Environment Variables:

`
NODE_ENV=production
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_super_secure_jwt_secret_minimum_32_characters
FRONTEND_URL=https://damio-kids-frontend.vercel.app
ADMIN_URL=https://damio-kids-admin.vercel.app
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
`

## File Changes Made

### 1. cors-config.js (New File)
Improved CORS configuration that:
- Dynamically detects Vercel domains
- Handles preview and production URLs
- Better error logging
- Supports your actual production domains

### 2. auth-middleware.js (New File)
Enhanced JWT middleware that:
- Extracts tokens from multiple sources (headers, cookies, body)
- Provides detailed error messages
- Handles malformed tokens gracefully
- Includes admin role checking

### 3. index-fixed.js (Improved Main File)
Updated server configuration with:
- Improved CORS setup
- Better error handling
- Token expiration
- Enhanced logging
- Graceful shutdown handling

## Deployment Steps

### Step 1: Update Your Render Environment Variables
1. Go to your Render dashboard
2. Select your damio-kids-backend service
3. Go to Environment tab
4. Add/update the environment variables listed above
5. Make sure JWT_SECRET is at least 32 characters long

### Step 2: Deploy the Fixed Backend Code
You have two options:

**Option A: Replace your current index.js**
`ash
# Backup current file (already done)
# Replace with fixed version
copy index-fixed.js index.js
`

**Option B: Gradually integrate changes**
1. Add the new configuration files (cors-config.js, auth-middleware.js)
2. Update your existing index.js to use these imports
3. Update CORS configuration section
4. Update authentication middleware

### Step 3: Update Frontend API Calls

Make sure your frontend apps are sending tokens correctly:

**Method 1: Using Authorization header (Recommended)**
`javascript
const token = localStorage.getItem('authToken');
const response = await fetch('https://damio-kids-backend.onrender.com/api/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': Bearer 
  },
  credentials: 'include',
  body: JSON.stringify(data)
});
`

**Method 2: Using auth-token header (Your current method)**
`javascript
const token = localStorage.getItem('authToken');
const response = await fetch('https://damio-kids-backend.onrender.com/api/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'auth-token': token
  },
  credentials: 'include',
  body: JSON.stringify(data)
});
`

### Step 4: Verify CORS Settings in Frontend

Make sure your frontend axios/fetch configurations include:
`javascript
// For axios
axios.defaults.withCredentials = true;

// For fetch
credentials: 'include'
`

## Testing the Fixes

### 1. Test CORS
`ash
curl -H "Origin: https://damio-kids-frontend.vercel.app" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     https://damio-kids-backend.onrender.com/health
`

### 2. Test Authentication
`ash
# Login to get token
curl -X POST https://damio-kids-backend.onrender.com/login \
  -H "Content-Type: application/json" \
  -H "Origin: https://damio-kids-frontend.vercel.app" \
  -d '{"email":"test@example.com","password":"testpassword"}'

# Use token in authenticated request
curl -X GET https://damio-kids-backend.onrender.com/admin/orders \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Origin: https://damio-kids-frontend.vercel.app"
`

### 3. Check Logs
Monitor your Render logs for:
- CORS allowing/blocking messages
- Authentication success/failure messages
- Any remaining error patterns

## Common Issues & Solutions

### Issue: Still getting CORS errors
**Solution**: Check that your frontend is sending the correct Origin header and using the right domain.

### Issue: JWT still malformed
**Solution**: Make sure the token is being stored and retrieved correctly in your frontend, without extra quotes or whitespace.

### Issue: 404 errors for routes
**Solution**: Verify that your API calls are using the correct paths and HTTP methods.

### Issue: Environment variables not working
**Solution**: Restart your Render service after updating environment variables.

## Monitoring & Debugging

Add these debug logs to your frontend to troubleshoot:

`javascript
// Before making API calls
console.log('API URL:', 'https://damio-kids-backend.onrender.com/endpoint');
console.log('Token:', localStorage.getItem('authToken'));
console.log('Origin:', window.location.origin);

// After API response
response.catch(error => {
  console.error('API Error:', error.response?.data || error.message);
});
`

## Security Notes

1. **JWT_SECRET**: Must be at least 32 characters, use a secure random string
2. **CORS**: The current configuration is permissive for Vercel domains. In a stricter environment, you might want to be more specific
3. **Rate Limiting**: Currently set to reasonable limits, adjust based on your traffic needs
4. **HTTPS Only**: All production origins should use HTTPS

## Support

If you continue to experience issues:

1. Check Render logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test with curl commands to isolate frontend vs backend issues
4. Monitor browser network tab for exact error responses
