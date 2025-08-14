const { Product, Order } = require('../models');
const { NotFoundError, ValidationError } = require('../middleware/errorHandler');

class InventoryService {
  
  /**
   * Update stock quantity for a product
   * @param {number} productId - Product ID
   * @param {number} quantity - Quantity to add/subtract (can be negative)
   * @param {string} reason - Reason for stock change
   * @param {string} userId - User making the change
   */
  static async updateStock(productId, quantity, reason = 'manual_adjustment', userId = null) {
    const product = await Product.findOne({ id: productId });
    
    if (!product) {
      throw new NotFoundError(`Product with ID ${productId} not found`);
    }
    
    const oldQuantity = product.stock_quantity;
    const newQuantity = oldQuantity + quantity;
    
    if (newQuantity < 0) {
      throw new ValidationError(`Insufficient stock. Available: ${oldQuantity}, Requested: ${Math.abs(quantity)}`);
    }
    
    // Update product stock
    product.stock_quantity = newQuantity;
    
    // Update availability status based on stock
    if (newQuantity === 0) {
      product.status = 'out_of_stock';
      product.avilable = false;
    } else if (product.status === 'out_of_stock' && newQuantity > 0) {
      product.status = 'active';
      product.avilable = true;
    }
    
    await product.save();
    
    // Log stock movement
    await this.logStockMovement({
      productId: product.id,
      productName: product.name,
      oldQuantity,
      newQuantity,
      quantityChanged: quantity,
      reason,
      userId,
      timestamp: new Date()
    });
    
    // Check for low stock alerts
    if (newQuantity <= this.getLowStockThreshold(product)) {
      await this.triggerLowStockAlert(product);
    }
    
    return {
      productId: product.id,
      productName: product.name,
      oldQuantity,
      newQuantity,
      quantityChanged: quantity,
      status: product.status,
      available: product.avilable
    };
  }
  
  /**
   * Reserve stock for an order (pending orders)
   * @param {Array} orderItems - Array of order items
   * @param {string} orderId - Order ID for tracking
   */
  static async reserveStock(orderItems, orderId) {
    const reservations = [];
    const errors = [];
    
    // Check availability for all items first
    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      
      if (!product) {
        errors.push(`Product ${item.name || item.productId} not found`);
        continue;
      }
      
      if (product.stock_quantity < item.quantity) {
        errors.push(`Insufficient stock for ${product.name}. Available: ${product.stock_quantity}, Requested: ${item.quantity}`);
      }
    }
    
    if (errors.length > 0) {
      throw new ValidationError(`Stock reservation failed: ${errors.join(', ')}`);
    }
    
    // Reserve stock for all items
    for (const item of orderItems) {
      const result = await this.updateStock(
        item.productId,
        -item.quantity,
        `order_reservation:${orderId}`,
        'system'
      );
      
      reservations.push({
        productId: item.productId,
        quantity: item.quantity,
        reserved: result
      });
    }
    
    return reservations;
  }
  
  /**
   * Release reserved stock (when order is cancelled)
   * @param {Array} orderItems - Array of order items
   * @param {string} orderId - Order ID for tracking
   */
  static async releaseReservedStock(orderItems, orderId) {
    const releases = [];
    
    for (const item of orderItems) {
      try {
        const result = await this.updateStock(
          item.productId,
          item.quantity,
          `order_cancellation:${orderId}`,
          'system'
        );
        
        releases.push({
          productId: item.productId,
          quantity: item.quantity,
          released: result
        });
      } catch (error) {
        console.error(`Failed to release stock for product ${item.productId}:`, error.message);
        // Continue with other items even if one fails
      }
    }
    
    return releases;
  }
  
  /**
   * Confirm stock usage (when order is fulfilled)
   * @param {Array} orderItems - Array of order items
   * @param {string} orderId - Order ID for tracking
   */
  static async confirmStockUsage(orderItems, orderId) {
    // Stock was already deducted during reservation
    // This is for logging purposes and analytics
    
    await this.logStockMovement({
      orderId,
      items: orderItems,
      reason: `order_fulfilled:${orderId}`,
      timestamp: new Date()
    });
    
    return {
      orderId,
      itemsConfirmed: orderItems.length,
      totalQuantity: orderItems.reduce((sum, item) => sum + item.quantity, 0)
    };
  }
  
  /**
   * Get low stock products
   * @param {number} threshold - Stock threshold (optional)
   */
  static async getLowStockProducts(threshold = null) {
    const query = {
      status: 'active',
      $expr: {
        $lte: ['$stock_quantity', threshold || { $multiply: ['$stock_quantity', 0.1] }]
      }
    };
    
    const lowStockProducts = await Product.find(query)
      .select('id name stock_quantity category brand new_price')
      .sort({ stock_quantity: 1 });
    
    return lowStockProducts.map(product => ({
      id: product.id,
      name: product.name,
      currentStock: product.stock_quantity,
      threshold: this.getLowStockThreshold(product),
      category: product.category,
      brand: product.brand,
      price: product.new_price,
      status: product.stock_quantity === 0 ? 'out_of_stock' : 'low_stock'
    }));
  }
  
  /**
   * Get out of stock products
   */
  static async getOutOfStockProducts() {
    const outOfStockProducts = await Product.find({
      $or: [
        { stock_quantity: 0 },
        { status: 'out_of_stock' },
        { avilable: false }
      ]
    })
    .select('id name stock_quantity category brand new_price status avilable')
    .sort({ name: 1 });
    
    return outOfStockProducts;
  }
  
  /**
   * Bulk stock update
   * @param {Array} updates - Array of {productId, quantity, reason}
   * @param {string} userId - User making the changes
   */
  static async bulkStockUpdate(updates, userId = null) {
    const results = [];
    const errors = [];
    
    for (const update of updates) {
      try {
        const result = await this.updateStock(
          update.productId,
          update.quantity,
          update.reason || 'bulk_update',
          userId
        );
        results.push(result);
      } catch (error) {
        errors.push({
          productId: update.productId,
          error: error.message
        });
      }
    }
    
    return {
      successful: results,
      failed: errors,
      totalProcessed: updates.length,
      successCount: results.length,
      errorCount: errors.length
    };
  }
  
  /**
   * Get inventory report
   * @param {Object} filters - Filtering options
   */
  static async getInventoryReport(filters = {}) {
    const {
      category,
      brand,
      status,
      lowStock = false,
      outOfStock = false
    } = filters;
    
    let query = {};
    
    if (category) query.category = new RegExp(category, 'i');
    if (brand) query.brand = new RegExp(brand, 'i');
    if (status) query.status = status;
    
    if (lowStock) {
      query.$expr = {
        $and: [
          { $gt: ['$stock_quantity', 0] },
          { $lte: ['$stock_quantity', 10] } // Low stock threshold
        ]
      };
    }
    
    if (outOfStock) {
      query.stock_quantity = 0;
    }
    
    const products = await Product.find(query)
      .select('id name stock_quantity category brand new_price status avilable')
      .sort({ stock_quantity: 1, name: 1 });
    
    const totalProducts = products.length;
    const totalValue = products.reduce((sum, product) => 
      sum + (product.stock_quantity * product.new_price), 0
    );
    const totalStock = products.reduce((sum, product) => sum + product.stock_quantity, 0);
    
    const stockDistribution = {
      inStock: products.filter(p => p.stock_quantity > 10).length,
      lowStock: products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 10).length,
      outOfStock: products.filter(p => p.stock_quantity === 0).length
    };
    
    return {
      products,
      summary: {
        totalProducts,
        totalStock,
        totalValue,
        stockDistribution
      }
    };
  }
  
  /**
   * Get stock movement history
   * @param {Object} filters - Filtering options
   */
  static async getStockMovementHistory(filters = {}) {
    // This would typically come from a separate StockMovement collection
    // For now, we'll return a placeholder structure
    return {
      movements: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalMovements: 0
      }
    };
  }
  
  /**
   * Private helper methods
   */
  
  /**
   * Get low stock threshold for a product
   * @param {Object} product - Product object
   */
  static getLowStockThreshold(product) {
    // Base threshold of 10, but could be customized per product/category
    if (product.category && product.category.toLowerCase().includes('seasonal')) {
      return Math.max(5, Math.floor(product.stock_quantity * 0.2));
    }
    
    return 10; // Default threshold
  }
  
  /**
   * Trigger low stock alert
   * @param {Object} product - Product object
   */
  static async triggerLowStockAlert(product) {
    // This would integrate with notification service
    console.warn(`LOW STOCK ALERT: ${product.name} (ID: ${product.id}) - Only ${product.stock_quantity} items left`);
    
    // TODO: Send notification to admins
    // await NotificationService.sendLowStockAlert(product);
  }
  
  /**
   * Log stock movement
   * @param {Object} movement - Movement data
   */
  static async logStockMovement(movement) {
    // This would typically save to a StockMovement collection
    console.log('Stock Movement:', JSON.stringify(movement, null, 2));
    
    // TODO: Save to StockMovement collection
    // await StockMovement.create(movement);
  }
}

module.exports = InventoryService;
