/**
 * Test Script for Firebase Push Notifications
 * 
 * Usage:
 * 1. Update BACKEND_URL with your Render URL
 * 2. Update ADMIN_TOKEN with a valid admin JWT token
 * 3. Run: node test-push-notifications.js
 */

const BACKEND_URL = 'https://your-backend-name.onrender.com'; // UPDATE THIS
const ADMIN_TOKEN = 'your-admin-jwt-token-here'; // UPDATE THIS

const fetch = require('node-fetch'); // You may need: npm install node-fetch@2

async function testPushNotifications() {
  console.log('🧪 Testing Firebase Push Notifications Integration');
  console.log('Backend URL:', BACKEND_URL);
  console.log('==========================================\n');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ADMIN_TOKEN}`
  };

  // Test 1: Check Firebase status
  console.log('1️⃣ Testing Firebase service status...');
  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/fcm/status`, {
      headers
    });
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Firebase Status:', data.pushNotificationService);
      console.log('   - Initialized:', data.pushNotificationService.initialized);
      console.log('   - Registered Devices:', data.pushNotificationService.registeredDevices);
      console.log('   - Has Service Account:', data.pushNotificationService.hasServiceAccount);
    } else {
      console.log('❌ Firebase Status Error:', data.error);
    }
  } catch (error) {
    console.log('❌ Connection Error:', error.message);
  }
  
  console.log('');

  // Test 2: Check registered devices
  console.log('2️⃣ Testing registered devices...');
  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/fcm/devices`, {
      headers
    });
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Registered Devices:', data.totalDevices);
      if (data.devices.length > 0) {
        data.devices.forEach((device, index) => {
          console.log(`   Device ${index + 1}:`, {
            adminId: device.adminId,
            deviceType: device.deviceType,
            registeredAt: device.registeredAt,
            tokenPreview: device.tokenPreview
          });
        });
      } else {
        console.log('   No devices registered yet.');
        console.log('   💡 Register devices by logging into admin panel with notifications enabled.');
      }
    } else {
      console.log('❌ Devices Error:', data.error);
    }
  } catch (error) {
    console.log('❌ Connection Error:', error.message);
  }

  console.log('');

  // Test 3: Test notification (only if there are registered devices)
  console.log('3️⃣ Testing push notification...');
  const testToken = 'fake-token-for-demo'; // This will fail but shows the endpoint works
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/fcm/test-notification`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fcmToken: testToken
      })
    });
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Test notification sent successfully');
    } else {
      if (data.error.includes('Invalid FCM token') || data.error.includes('invalid-registration-token')) {
        console.log('✅ Test endpoint working (expected error with fake token)');
        console.log('   Use a real FCM token from browser console to test actual notifications');
      } else {
        console.log('❌ Test notification error:', data.error);
      }
    }
  } catch (error) {
    console.log('❌ Connection Error:', error.message);
  }

  console.log('');
  console.log('🎯 Test Summary:');
  console.log('================');
  console.log('- Check that Firebase service is initialized');
  console.log('- Verify environment variables are set correctly');
  console.log('- Register devices by logging into admin panel');
  console.log('- Test actual notifications by placing test orders');
  console.log('');
  console.log('🔗 Useful URLs:');
  console.log(`- Firebase Status: ${BACKEND_URL}/api/admin/fcm/status`);
  console.log(`- Registered Devices: ${BACKEND_URL}/api/admin/fcm/devices`);
  console.log(`- Admin Panel: https://your-admin.vercel.app`);
}

// Run the test
if (require.main === module) {
  if (BACKEND_URL.includes('your-backend-name') || ADMIN_TOKEN === 'your-admin-jwt-token-here') {
    console.log('❌ Please update BACKEND_URL and ADMIN_TOKEN in the script first!');
    process.exit(1);
  }
  
  testPushNotifications().catch(console.error);
}

module.exports = { testPushNotifications };