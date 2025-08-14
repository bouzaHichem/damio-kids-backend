const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.adminSockets = new Set(); // Set of admin socket IDs
    this.userSockets = new Map(); // socketId -> userInfo
  }
  
  /**
   * Initialize WebSocket server
   * @param {Object} server - HTTP server instance
   */
  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: [
          'http://localhost:3000',
          'http://localhost:3001',
          process.env.FRONTEND_URL,
          process.env.ADMIN_URL
        ].filter(Boolean),
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });
    
    // Authentication middleware
    this.io.use(this.authenticateSocket.bind(this));
    
    // Handle connections
    this.io.on('connection', this.handleConnection.bind(this));
    
    console.log('WebSocket service initialized');
  }
  
  /**
   * Authenticate WebSocket connection
   * @param {Object} socket - Socket instance
   * @param {Function} next - Next middleware
   */
  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        // Allow anonymous connections for public features
        socket.userInfo = {
          id: null,
          role: 'anonymous',
          authenticated: false
        };
        return next();
      }
      
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userInfo = {
        id: decoded.user.id,
        role: decoded.user.role,
        authenticated: true
      };
      
      next();
    } catch (error) {
      // Allow connection but mark as unauthenticated
      socket.userInfo = {
        id: null,
        role: 'anonymous',
        authenticated: false
      };
      next();
    }
  }
  
  /**
   * Handle new socket connection
   * @param {Object} socket - Socket instance
   */
  handleConnection(socket) {
    const { id: userId, role, authenticated } = socket.userInfo;
    
    console.log(`Socket connected: ${socket.id} (User: ${userId || 'anonymous'}, Role: ${role})`);
    
    // Store socket information
    this.userSockets.set(socket.id, socket.userInfo);
    
    if (authenticated && userId) {
      this.connectedUsers.set(userId, socket.id);
      
      // Track admin connections
      if (role === 'admin') {
        this.adminSockets.add(socket.id);
      }
      
      // Join user-specific room
      socket.join(`user:${userId}`);
    }
    
    // Join role-specific rooms
    socket.join(`role:${role}`);
    
    // Send connection confirmation
    socket.emit('connected', {
      socketId: socket.id,
      authenticated,
      role,
      timestamp: new Date().toISOString()
    });
    
    // Set up event listeners
    this.setupEventListeners(socket);
    
    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
    
    // Notify admins of new connection
    if (authenticated && role !== 'admin') {
      this.notifyAdmins('user_connected', {
        userId,
        role,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Set up event listeners for socket
   * @param {Object} socket - Socket instance
   */
  setupEventListeners(socket) {
    const { id: userId, role, authenticated } = socket.userInfo;
    
    // Ping/Pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });
    
    // Subscribe to order updates (authenticated users only)
    socket.on('subscribe_orders', () => {
      if (authenticated && userId) {
        socket.join(`orders:${userId}`);
        socket.emit('subscribed', { type: 'orders', userId });
      }
    });
    
    // Subscribe to inventory updates (admin only)
    socket.on('subscribe_inventory', () => {
      if (role === 'admin') {
        socket.join('inventory_updates');
        socket.emit('subscribed', { type: 'inventory' });
      }
    });
    
    // Subscribe to analytics updates (admin only)
    socket.on('subscribe_analytics', () => {
      if (role === 'admin') {
        socket.join('analytics_updates');
        socket.emit('subscribed', { type: 'analytics' });
      }
    });
    
    // Join product notification room
    socket.on('subscribe_product', ({ productId }) => {
      if (productId) {
        socket.join(`product:${productId}`);
        socket.emit('subscribed', { type: 'product', productId });
      }
    });
    
    // Leave product notification room
    socket.on('unsubscribe_product', ({ productId }) => {
      if (productId) {
        socket.leave(`product:${productId}`);
        socket.emit('unsubscribed', { type: 'product', productId });
      }
    });
    
    // Handle custom events for admin
    if (role === 'admin') {
      socket.on('request_stats', async () => {
        try {
          const stats = await this.getRealtimeStats();
          socket.emit('realtime_stats', stats);
        } catch (error) {
          socket.emit('error', { message: 'Failed to fetch stats' });
        }
      });
      
      socket.on('broadcast_message', (data) => {
        // Broadcast message to all users
        this.broadcast('admin_message', data);
      });
    }
  }
  
  /**
   * Handle socket disconnection
   * @param {Object} socket - Socket instance
   */
  handleDisconnection(socket) {
    const userInfo = this.userSockets.get(socket.id);
    
    if (userInfo) {
      const { id: userId, role, authenticated } = userInfo;
      
      console.log(`Socket disconnected: ${socket.id} (User: ${userId || 'anonymous'})`);
      
      // Clean up tracking
      this.userSockets.delete(socket.id);
      
      if (authenticated && userId) {
        this.connectedUsers.delete(userId);
      }
      
      if (role === 'admin') {
        this.adminSockets.delete(socket.id);
      }
      
      // Notify admins of disconnection
      if (authenticated && role !== 'admin') {
        this.notifyAdmins('user_disconnected', {
          userId,
          role,
          timestamp: new Date().toISOString()
        });
      }
    }
  }
  
  /**
   * Send notification to specific user
   * @param {string} userId - User ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  notifyUser(userId, event, data) {
    if (!this.io) return false;
    
    this.io.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    return true;
  }
  
  /**
   * Send notification to all admins
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  notifyAdmins(event, data) {
    if (!this.io) return false;
    
    this.io.to('role:admin').emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    return true;
  }
  
  /**
   * Broadcast to all connected clients
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  broadcast(event, data) {
    if (!this.io) return false;
    
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    return true;
  }
  
  /**
   * Send notification to specific room
   * @param {string} room - Room name
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  notifyRoom(room, event, data) {
    if (!this.io) return false;
    
    this.io.to(room).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    return true;
  }
  
  /**
   * Order-related notifications
   */
  
  /**
   * Notify user about order status change
   * @param {string} userId - User ID
   * @param {Object} order - Order data
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   */
  notifyOrderStatusChange(userId, order, oldStatus, newStatus) {
    this.notifyUser(userId, 'order_status_changed', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      oldStatus,
      newStatus,
      statusDisplay: this.getStatusDisplay(newStatus)
    });
    
    // Also notify admins
    this.notifyAdmins('order_status_updated', {
      userId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      oldStatus,
      newStatus,
      customerName: order.customerInfo?.name
    });
  }
  
  /**
   * Notify user about new order confirmation
   * @param {string} userId - User ID
   * @param {Object} order - Order data
   */
  notifyOrderConfirmed(userId, order) {
    this.notifyUser(userId, 'order_confirmed', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
      estimatedDelivery: order.estimatedDeliveryDate
    });
    
    // Notify admins of new order
    this.notifyAdmins('new_order', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
      customerName: order.customerInfo?.name,
      itemCount: order.items?.length || 0
    });
  }
  
  /**
   * Inventory-related notifications
   */
  
  /**
   * Notify about stock changes
   * @param {Object} product - Product data
   * @param {number} oldStock - Previous stock quantity
   * @param {number} newStock - New stock quantity
   */
  notifyStockChange(product, oldStock, newStock) {
    const stockData = {
      productId: product.id,
      productName: product.name,
      oldStock,
      newStock,
      status: this.getStockStatus(newStock)
    };
    
    // Notify admins
    this.notifyAdmins('stock_changed', stockData);
    
    // Notify subscribers to this product
    this.notifyRoom(`product:${product.id}`, 'product_stock_updated', stockData);
    
    // If stock is low, send special alert
    if (newStock <= 10 && newStock > 0) {
      this.notifyAdmins('low_stock_alert', {
        ...stockData,
        threshold: 10,
        urgent: newStock <= 5
      });
    }
    
    // If out of stock
    if (newStock === 0) {
      this.notifyAdmins('out_of_stock_alert', stockData);
      this.notifyRoom(`product:${product.id}`, 'product_out_of_stock', stockData);
    }
  }
  
  /**
   * Analytics and system notifications
   */
  
  /**
   * Send real-time analytics update
   * @param {Object} analyticsData - Analytics data
   */
  notifyAnalyticsUpdate(analyticsData) {
    this.notifyRoom('analytics_updates', 'analytics_updated', analyticsData);
  }
  
  /**
   * Send system health update
   * @param {Object} healthData - System health data
   */
  notifySystemHealth(healthData) {
    this.notifyAdmins('system_health', healthData);
  }
  
  /**
   * Get connection statistics
   */
  getConnectionStats() {
    const totalConnections = this.userSockets.size;
    const authenticatedUsers = Array.from(this.userSockets.values()).filter(u => u.authenticated).length;
    const adminConnections = this.adminSockets.size;
    const anonymousConnections = totalConnections - authenticatedUsers;
    
    return {
      total: totalConnections,
      authenticated: authenticatedUsers,
      anonymous: anonymousConnections,
      admins: adminConnections,
      users: authenticatedUsers - adminConnections
    };
  }
  
  /**
   * Get real-time statistics for dashboard
   */
  async getRealtimeStats() {
    const connections = this.getConnectionStats();
    
    // You can add more real-time stats here
    return {
      connections,
      timestamp: new Date().toISOString(),
      serverUptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };
  }
  
  /**
   * Utility methods
   */
  
  /**
   * Get display name for order status
   * @param {string} status - Order status
   */
  getStatusDisplay(status) {
    const statusMap = {
      pending: 'Pending Confirmation',
      confirmed: 'Confirmed',
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      cancelled: 'Cancelled'
    };
    return statusMap[status] || status;
  }
  
  /**
   * Get stock status string
   * @param {number} quantity - Stock quantity
   */
  getStockStatus(quantity) {
    if (quantity <= 0) return 'out_of_stock';
    if (quantity <= 5) return 'critical';
    if (quantity <= 10) return 'low';
    return 'normal';
  }
  
  /**
   * Check if user is connected
   * @param {string} userId - User ID
   */
  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }
  
  /**
   * Get all connected admin socket IDs
   */
  getConnectedAdmins() {
    return Array.from(this.adminSockets);
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.io) {
      // Notify all clients about server shutdown
      this.broadcast('server_shutdown', {
        message: 'Server is shutting down. Please reconnect in a few moments.',
        reconnect: true
      });
      
      // Close all connections
      this.io.close();
      console.log('WebSocket service shut down gracefully');
    }
  }
}

// Export singleton instance
module.exports = new WebSocketService();
