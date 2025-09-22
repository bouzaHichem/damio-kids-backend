/**
 * Push Notification Service for Firebase Cloud Messaging
 * Handles sending push notifications to admin devices when orders are placed
 */

const admin = require('firebase-admin');
const path = require('path');

class PushNotificationService {
  constructor() {
    this.initialized = false;
    this.registeredDevices = new Map(); // Store FCM tokens
    this.initializeFirebaseAdmin();
  }

  /**
   * Initialize Firebase Admin SDK
   */
  initializeFirebaseAdmin() {
    try {
      // Check if Firebase Admin is already initialized
      if (admin.apps.length > 0) {
        console.log('🔥 Firebase Admin already initialized');
        this.initialized = true;
        return;
      }

      // Initialize with service account (more secure for server)
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
        
        console.log('✅ Firebase Admin initialized with service account');
      } else if (process.env.FIREBASE_SERVER_KEY) {
        // Fallback to server key (less secure, but simpler setup)
        console.warn('⚠️ Using Firebase Server Key (consider upgrading to Service Account)');
        // Note: Server key method is deprecated, but keeping for compatibility
        this.serverKey = process.env.FIREBASE_SERVER_KEY;
      } else {
        console.error('❌ No Firebase credentials found');
        console.error('Please set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVER_KEY');
        return;
      }

      this.initialized = true;
      console.log('🚀 Push notification service initialized');

    } catch (error) {
      console.error('❌ Failed to initialize Firebase Admin:', error.message);
      this.initialized = false;
    }
  }

  /**
   * Register a device token for push notifications
   */
  async registerDevice(adminId, deviceData) {
    try {
      const { fcmToken, deviceType, userAgent, timestamp } = deviceData;
      
      if (!fcmToken) {
        return { success: false, error: 'FCM token is required' };
      }

      // Store device registration
      const deviceInfo = {
        adminId,
        fcmToken,
        deviceType: deviceType || 'web',
        userAgent: userAgent || 'Unknown',
        registeredAt: new Date(timestamp || Date.now()),
        lastUsed: new Date(),
        isActive: true
      };

      this.registeredDevices.set(fcmToken, deviceInfo);
      
      console.log(`📱 Device registered for admin ${adminId}:`, {
        token: fcmToken.substring(0, 20) + '...',
        type: deviceType
      });

      // Validate token by sending a test (silent) notification
      if (this.initialized && admin.apps.length > 0) {
        try {
          await admin.messaging().send({
            token: fcmToken,
            data: {
              type: 'registration-test',
              message: 'Device registered successfully'
            },
            android: { priority: 'normal' },
            apns: { headers: { 'apns-priority': '5' } },
            webpush: { headers: { Urgency: 'normal' } }
          });
          console.log('✅ Token validation successful');
        } catch (testError) {
          console.warn('⚠️ Token validation failed (token might be invalid):', testError.message);
          return { success: false, error: 'Invalid FCM token' };
        }
      }

      return { 
        success: true, 
        message: 'Device registered successfully',
        deviceId: fcmToken.substring(0, 20) + '...'
      };

    } catch (error) {
      console.error('❌ Error registering device:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to all registered admin devices
   */
  async sendOrderNotification(order) {
    if (!this.initialized || this.registeredDevices.size === 0) {
      console.warn('⚠️ No devices registered or push service not initialized');
      return { success: false, error: 'No devices registered' };
    }

    const results = {
      success: false,
      totalDevices: this.registeredDevices.size,
      successfulSends: 0,
      failedSends: 0,
      errors: []
    };

    try {
      console.log(`📱 Sending push notifications to ${this.registeredDevices.size} device(s)...`);

      // Prepare notification data
      const notificationData = {
        title: '🚨 New Order Alert!',
        body: `Order #${order.orderNumber} - ${this.formatCurrency(order.total)} DZD`,
        data: {
          type: 'new-order',
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          total: order.total.toString(),
          customerName: order.customerInfo.name,
          items: order.items.length.toString(),
          timestamp: Date.now().toString(),
          url: `/orders/${order._id}`,
          priority: 'high'
        },
        notification: {
          title: '🚨 New Order Alert!',
          body: `Order #${order.orderNumber} - ${this.formatCurrency(order.total)} DZD`,
          icon: '/icon-192x192.png',
          badge: '/favicon.ico',
          tag: 'new-order',
          requireInteraction: true
        }
      };

      // Send to all registered devices
      const sendPromises = Array.from(this.registeredDevices.entries()).map(
        async ([token, deviceInfo]) => {
          try {
            // Update last used timestamp
            deviceInfo.lastUsed = new Date();

            const message = {
              token: token,
              ...notificationData,
              webpush: {
                headers: {
                  Urgency: 'high',
                  TTL: '3600'
                },
                notification: {
                  ...notificationData.notification,
                  actions: [
                    {
                      action: 'view',
                      title: 'View Order'
                    },
                    {
                      action: 'dismiss',
                      title: 'Dismiss'
                    }
                  ],
                  vibrate: [200, 100, 200, 100, 200],
                  silent: false,
                  renotify: true
                }
              },
              android: {
                priority: 'high',
                notification: {
                  ...notificationData.notification,
                  channelId: 'order_notifications',
                  priority: 'high',
                  defaultSound: true,
                  defaultVibrateTimings: true
                }
              },
              apns: {
                headers: {
                  'apns-priority': '10'
                },
                payload: {
                  aps: {
                    alert: {
                      title: notificationData.title,
                      body: notificationData.body
                    },
                    badge: 1,
                    sound: 'default',
                    category: 'ORDER_ALERT'
                  }
                }
              }
            };

            if (this.initialized && admin.apps.length > 0) {
              const response = await admin.messaging().send(message);
              console.log(`✅ Notification sent successfully to device: ${token.substring(0, 20)}...`);
              results.successfulSends++;
              return { success: true, messageId: response };
            } else {
              throw new Error('Firebase Admin not initialized');
            }

          } catch (error) {
            console.error(`❌ Failed to send to device ${token.substring(0, 20)}...:`, error.message);
            
            // Remove invalid tokens
            if (error.code === 'messaging/invalid-registration-token' || 
                error.code === 'messaging/registration-token-not-registered') {
              console.log(`🗑️ Removing invalid token: ${token.substring(0, 20)}...`);
              this.registeredDevices.delete(token);
            }
            
            results.errors.push({
              token: token.substring(0, 20) + '...',
              error: error.message
            });
            results.failedSends++;
            return { success: false, error: error.message };
          }
        }
      );

      // Wait for all send attempts to complete
      await Promise.allSettled(sendPromises);

      results.success = results.successfulSends > 0;

      console.log(`📊 Push notification results:`, {
        total: results.totalDevices,
        successful: results.successfulSends,
        failed: results.failedSends
      });

      return results;

    } catch (error) {
      console.error('❌ Error sending push notifications:', error);
      results.errors.push({ error: error.message });
      return results;
    }
  }

  /**
   * Send status update notification
   */
  async sendOrderStatusUpdate(order, oldStatus, newStatus) {
    if (!this.initialized || this.registeredDevices.size === 0) {
      return { success: false, error: 'No devices registered' };
    }

    try {
      console.log(`📱 Sending status update notifications for order ${order.orderNumber}: ${oldStatus} → ${newStatus}`);

      const statusEmojis = {
        'pending': '⏳',
        'confirmed': '✅',
        'processing': '⚙️',
        'shipped': '🚚',
        'delivered': '📦',
        'cancelled': '❌',
        'returned': '↩️'
      };

      const notificationData = {
        title: `${statusEmojis[newStatus]} Order Status Update`,
        body: `Order #${order.orderNumber} is now ${newStatus}`,
        data: {
          type: 'order-update',
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          oldStatus: oldStatus,
          newStatus: newStatus,
          timestamp: Date.now().toString(),
          url: `/orders/${order._id}`
        }
      };

      const sendPromises = Array.from(this.registeredDevices.keys()).map(async (token) => {
        try {
          const message = {
            token: token,
            ...notificationData
          };

          if (admin.apps.length > 0) {
            await admin.messaging().send(message);
            console.log(`✅ Status update sent to device: ${token.substring(0, 20)}...`);
            return { success: true };
          }
        } catch (error) {
          console.error(`❌ Failed to send status update to ${token.substring(0, 20)}...:`, error.message);
          return { success: false, error: error.message };
        }
      });

      const results = await Promise.allSettled(sendPromises);
      const successful = results.filter(r => r.value?.success).length;

      return {
        success: successful > 0,
        totalDevices: this.registeredDevices.size,
        successfulSends: successful
      };

    } catch (error) {
      console.error('❌ Error sending status update notifications:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send test notification
   */
  async sendTestNotification(token) {
    if (!this.initialized) {
      return { success: false, error: 'Push service not initialized' };
    }

    try {
      const testMessage = {
        token: token,
        notification: {
          title: '🧪 Test Notification',
          body: 'Your push notifications are working perfectly! 🎉'
        },
        data: {
          type: 'test',
          timestamp: Date.now().toString()
        },
        webpush: {
          notification: {
            icon: '/icon-192x192.png',
            badge: '/favicon.ico',
            requireInteraction: true
          }
        }
      };

      if (admin.apps.length > 0) {
        const response = await admin.messaging().send(testMessage);
        console.log('✅ Test notification sent successfully:', response);
        return { success: true, messageId: response };
      } else {
        throw new Error('Firebase Admin not initialized');
      }

    } catch (error) {
      console.error('❌ Error sending test notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get registered devices info
   */
  getRegisteredDevices() {
    return Array.from(this.registeredDevices.values()).map(device => ({
      adminId: device.adminId,
      deviceType: device.deviceType,
      userAgent: device.userAgent,
      registeredAt: device.registeredAt,
      lastUsed: device.lastUsed,
      isActive: device.isActive,
      tokenPreview: device.fcmToken.substring(0, 20) + '...'
    }));
  }

  /**
   * Remove device token
   */
  removeDevice(token) {
    const removed = this.registeredDevices.delete(token);
    if (removed) {
      console.log(`🗑️ Device token removed: ${token.substring(0, 20)}...`);
    }
    return removed;
  }

  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    let removed = 0;
    for (const [token, device] of this.registeredDevices) {
      if (device.lastUsed < thirtyDaysAgo) {
        this.registeredDevices.delete(token);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} expired device token(s)`);
    }
    
    return removed;
  }

  /**
   * Format currency helper
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('ar-DZ', {
      style: 'currency',
      currency: 'DZD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      firebaseAppsCount: admin.apps.length,
      registeredDevices: this.registeredDevices.size,
      hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      hasServerKey: !!process.env.FIREBASE_SERVER_KEY
    };
  }
}

// Create singleton instance
const pushNotificationService = new PushNotificationService();

module.exports = pushNotificationService;