const bizSdk = require('facebook-nodejs-business-sdk');
const crypto = require('crypto');

// Initialize Facebook Business SDK
const Content = bizSdk.Content;
const CustomData = bizSdk.CustomData;
const DeliveryCategory = bizSdk.DeliveryCategory;
const EventRequest = bizSdk.EventRequest;
const UserData = bizSdk.UserData;
const ServerEvent = bizSdk.ServerEvent;

/**
 * Facebook Conversions API Controller
 * Handles server-side event tracking for improved attribution and iOS 14.5+ compatibility
 */

// Configuration
const PIXEL_ID = process.env.FACEBOOK_PIXEL_ID;
const ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

// Validate configuration
if (!PIXEL_ID || !ACCESS_TOKEN) {
  console.warn('⚠️  Facebook Conversions API: PIXEL_ID or ACCESS_TOKEN not configured');
}

/**
 * Hash user data for privacy compliance (Facebook requirement)
 * @param {string} data - Data to hash (email, phone, etc.)
 * @returns {string} - Hashed data
 */
const hashData = (data) => {
  if (!data) return null;
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
};

/**
 * Normalize phone number to international format
 * @param {string} phone - Phone number
 * @returns {string} - Normalized phone number
 */
const normalizePhone = (phone) => {
  if (!phone) return null;
  
  // Remove all non-digit characters except +
  let normalized = phone.toString().replace(/[^\d+]/g, '');
  
  // If doesn't start with +, assume Algeria (+213)
  if (!normalized.startsWith('+')) {
    // If starts with 0, remove it (Algerian mobile format)
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
    }
    normalized = '+213' + normalized;
  }
  
  return normalized;
};

/**
 * Extract user data from request for tracking
 * @param {Object} req - Express request object
 * @param {Object} customerData - Customer information
 * @returns {UserData} - Facebook UserData object
 */
const buildUserData = (req, customerData = {}) => {
  const userData = new UserData();
  
  // Hash email and phone for privacy
  if (customerData.email) {
    userData.setEmail(hashData(customerData.email));
  }
  
  if (customerData.phone) {
    const normalizedPhone = normalizePhone(customerData.phone);
    if (normalizedPhone) {
      userData.setPhone(hashData(normalizedPhone));
    }
  }
  
  // Add client data
  if (customerData.firstName) {
    userData.setFirstName(hashData(customerData.firstName));
  }
  
  if (customerData.lastName) {
    userData.setLastName(hashData(customerData.lastName));
  }
  
  // Add technical data
  if (req.ip) {
    userData.setClientIpAddress(req.ip);
  }
  
  if (req.get('User-Agent')) {
    userData.setClientUserAgent(req.get('User-Agent'));
  }
  
  // Add location data if available
  if (customerData.city) {
    userData.setCity(hashData(customerData.city));
  }
  
  if (customerData.state) {
    userData.setState(hashData(customerData.state));
  }
  
  if (customerData.country) {
    userData.setCountry(hashData(customerData.country));
  }
  
  return userData;
};

/**
 * Send a Purchase event to Facebook Conversions API
 * @param {Object} orderData - Order information
 * @param {Object} req - Express request object
 * @param {Object} customerData - Customer information
 */
const sendPurchaseEvent = async (orderData, req, customerData = {}) => {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn('❌ Facebook CAPI: Configuration missing, skipping Purchase event');
    return { success: false, error: 'Configuration missing' };
  }

  try {
    // Build user data
    const userData = buildUserData(req, customerData);
    
    // Build content data (products)
    const contents = [];
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items.forEach(item => {
        const content = new Content()
          .setProductId(String(item.productId || item.id))
          .setQuantity(item.quantity || 1)
          .setItemPrice(item.price || 0);
        contents.push(content);
      });
    }
    
    // Build custom data
    const customData = new CustomData()
      .setValue(orderData.total || orderData.total_amount || 0)
      .setCurrency('DZD')
      .setContents(contents)
      .setOrderId(String(orderData.orderId || orderData.order_id));
    
    // Add additional data
    if (orderData.deliveryType || orderData.delivery_method) {
      customData.setDeliveryCategory(DeliveryCategory.HOME_DELIVERY);
    }
    
    // Create server event
    const serverEvent = new ServerEvent()
      .setEventName('Purchase')
      .setEventTime(Math.floor(Date.now() / 1000))
      .setUserData(userData)
      .setCustomData(customData)
      .setEventSourceUrl(req.get('Referer') || `${req.protocol}://${req.get('host')}/`)
      .setActionSource('website');
    
    // Create and send event request
    const eventRequest = new EventRequest(ACCESS_TOKEN, PIXEL_ID)
      .setEvents([serverEvent]);
    
    // Send the event
    const response = await eventRequest.execute();
    
    console.log('✅ Facebook CAPI: Purchase event sent successfully', {
      order_id: orderData.orderId || orderData.order_id,
      value: orderData.total || orderData.total_amount,
      items: contents.length,
      events_received: response?.events_received || 0
    });
    
    return { 
      success: true, 
      events_received: response?.events_received || 0,
      fbtrace_id: response?.fbtrace_id 
    };
    
  } catch (error) {
    console.error('❌ Facebook CAPI: Purchase event error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send an InitiateCheckout event to Facebook Conversions API
 * @param {Object} checkoutData - Checkout information
 * @param {Object} req - Express request object
 * @param {Object} customerData - Customer information
 */
const sendInitiateCheckoutEvent = async (checkoutData, req, customerData = {}) => {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn('❌ Facebook CAPI: Configuration missing, skipping InitiateCheckout event');
    return { success: false, error: 'Configuration missing' };
  }

  try {
    // Build user data
    const userData = buildUserData(req, customerData);
    
    // Build content data
    const contents = [];
    if (checkoutData.items && Array.isArray(checkoutData.items)) {
      checkoutData.items.forEach(item => {
        const content = new Content()
          .setProductId(String(item.productId || item.id))
          .setQuantity(item.quantity || 1)
          .setItemPrice(item.price || 0);
        contents.push(content);
      });
    }
    
    // Build custom data
    const customData = new CustomData()
      .setValue(checkoutData.total || checkoutData.total_amount || 0)
      .setCurrency('DZD')
      .setContents(contents)
      .setNumItems(checkoutData.items?.length || 0);
    
    // Create server event
    const serverEvent = new ServerEvent()
      .setEventName('InitiateCheckout')
      .setEventTime(Math.floor(Date.now() / 1000))
      .setUserData(userData)
      .setCustomData(customData)
      .setEventSourceUrl(req.get('Referer') || `${req.protocol}://${req.get('host')}/checkout`)
      .setActionSource('website');
    
    // Create and send event request
    const eventRequest = new EventRequest(ACCESS_TOKEN, PIXEL_ID)
      .setEvents([serverEvent]);
    
    const response = await eventRequest.execute();
    
    console.log('✅ Facebook CAPI: InitiateCheckout event sent successfully', {
      value: checkoutData.total || checkoutData.total_amount,
      items: contents.length
    });
    
    return { 
      success: true, 
      events_received: response?.events_received || 0 
    };
    
  } catch (error) {
    console.error('❌ Facebook CAPI: InitiateCheckout event error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send a custom event to Facebook Conversions API
 * @param {string} eventName - Custom event name
 * @param {Object} eventData - Event data
 * @param {Object} req - Express request object
 * @param {Object} customerData - Customer information
 */
const sendCustomEvent = async (eventName, eventData, req, customerData = {}) => {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn('❌ Facebook CAPI: Configuration missing, skipping custom event');
    return { success: false, error: 'Configuration missing' };
  }

  try {
    // Build user data
    const userData = buildUserData(req, customerData);
    
    // Build custom data
    const customData = new CustomData()
      .setValue(eventData.value || 0)
      .setCurrency(eventData.currency || 'DZD');
    
    // Add additional properties
    if (eventData.content_ids) {
      const contents = eventData.content_ids.map(id => 
        new Content().setProductId(String(id))
      );
      customData.setContents(contents);
    }
    
    // Create server event
    const serverEvent = new ServerEvent()
      .setEventName(eventName)
      .setEventTime(Math.floor(Date.now() / 1000))
      .setUserData(userData)
      .setCustomData(customData)
      .setEventSourceUrl(eventData.source_url || req.get('Referer') || `${req.protocol}://${req.get('host')}/`)
      .setActionSource('website');
    
    // Create and send event request
    const eventRequest = new EventRequest(ACCESS_TOKEN, PIXEL_ID)
      .setEvents([serverEvent]);
    
    const response = await eventRequest.execute();
    
    console.log(`✅ Facebook CAPI: ${eventName} event sent successfully`);
    
    return { 
      success: true, 
      events_received: response?.events_received || 0 
    };
    
  } catch (error) {
    console.error(`❌ Facebook CAPI: ${eventName} event error:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Test Facebook Conversions API connection
 */
const testConnection = async () => {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    return { 
      success: false, 
      error: 'FACEBOOK_PIXEL_ID and FACEBOOK_ACCESS_TOKEN must be configured' 
    };
  }

  try {
    // Send a test event
    const userData = new UserData()
      .setEmail(hashData('test@example.com'));
    
    const customData = new CustomData()
      .setValue(1)
      .setCurrency('DZD');
    
    const serverEvent = new ServerEvent()
      .setEventName('PageView')
      .setEventTime(Math.floor(Date.now() / 1000))
      .setUserData(userData)
      .setCustomData(customData)
      .setActionSource('website');
    
    const eventRequest = new EventRequest(ACCESS_TOKEN, PIXEL_ID)
      .setEvents([serverEvent])
      .setTestEventCode('TEST12345'); // Use test event code
    
    const response = await eventRequest.execute();
    
    return {
      success: true,
      message: 'Facebook Conversions API connection successful',
      events_received: response?.events_received || 0,
      pixel_id: PIXEL_ID
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      pixel_id: PIXEL_ID
    };
  }
};

module.exports = {
  sendPurchaseEvent,
  sendInitiateCheckoutEvent,
  sendCustomEvent,
  testConnection,
  // Helper functions for manual use
  buildUserData,
  hashData,
  normalizePhone
};