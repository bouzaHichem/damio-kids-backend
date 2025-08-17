// Quick verification script to test your deployed backend
// Run this after deployment: node verify-deployment.js

const https = require('https');

const BACKEND_URL = 'https://damio-kids-backend.onrender.com';
const FRONTEND_URL = 'https://damio-kids-frontend.vercel.app';
const ADMIN_URL = 'https://damio-kids-admin.vercel.app';

console.log('?? Verifying Damio Kids Backend Deployment...\n');

// Test health endpoint
function testHealth() {
  return new Promise((resolve, reject) => {
    const req = https.get(${BACKEND_URL}/health, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('? Health Check:', result.status === 'OK' ? 'PASSED' : 'FAILED');
          console.log('   Environment:', result.environment);
          console.log('   Timestamp:', result.timestamp);
          resolve(result);
        } catch (error) {
          console.log('? Health Check: FAILED - Invalid JSON response');
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log('? Health Check: FAILED - Network error');
      console.log('   Error:', error.message);
      reject(error);
    });
    
    req.setTimeout(10000, () => {
      console.log('? Health Check: FAILED - Timeout');
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// Test CORS preflight
function testCORS(origin, name) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'damio-kids-backend.onrender.com',
      path: '/health',
      method: 'OPTIONS',
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization'
      }
    };

    const req = https.request(options, (res) => {
      const corsAllowed = res.headers['access-control-allow-origin'] === origin || 
                         res.headers['access-control-allow-origin'] === '*';
      
      console.log(${corsAllowed ? '?' : '?'} CORS :, corsAllowed ? 'ALLOWED' : 'BLOCKED');
      console.log(   Origin: );
      console.log(   Response: );
      
      resolve(corsAllowed);
    });

    req.on('error', (error) => {
      console.log(? CORS : ERROR - );
      reject(error);
    });

    req.setTimeout(10000, () => {
      console.log(? CORS : TIMEOUT);
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.end();
  });
}

// Run all tests
async function runTests() {
  try {
    await testHealth();
    console.log('');
    
    await testCORS(FRONTEND_URL, 'Frontend');
    console.log('');
    
    await testCORS(ADMIN_URL, 'Admin Panel');
    console.log('');
    
    console.log('?? Verification Complete!');
    console.log('\n?? Next Steps:');
    console.log('1. Test login from both frontend and admin panel');
    console.log('2. Check browser console for any remaining errors');
    console.log('3. Verify authenticated routes work correctly');
    console.log('4. Test file uploads and other functionality');
    
  } catch (error) {
    console.log('\n?? Deployment verification failed!');
    console.log('Please check:');
    console.log('- Render service is running');
    console.log('- Environment variables are set correctly');
    console.log('- Latest code is deployed');
  }
}

runTests();
