const emailService = require('./emailService');
const EmailTemplates = require('./emailTemplates');

/**
 * Order Notification Service
 * Handles all email notifications related to orders
 */

class OrderNotificationService {
  constructor() {
    this.emailService = emailService;
    this.config = {
      adminEmail: process.env.ADMIN_EMAIL,
      enableAdminNotifications: process.env.ENABLE_ADMIN_EMAIL_NOTIFICATIONS !== 'false',
      enableCustomerNotifications: process.env.ENABLE_CUSTOMER_EMAIL_NOTIFICATIONS !== 'false',
      sendCustomerNotifications: process.env.SEND_CUSTOMER_ORDER_CONFIRMATION !== 'false'
    };
  }

  /**
   * Send notifications for a new order
   * @param {Object} order - Order object from database
   * @returns {Object} - Notification results
   */
  async sendNewOrderNotifications(order) {
    const results = {
      adminNotification: null,
      customerNotification: null,
      success: false,
      errors: []
    };

    console.log(`📧 Sending order notifications for order ${order.orderNumber}`);

    try {
      // Send admin notification
      if (this.config.enableAdminNotifications && this.config.adminEmail) {
        try {
          results.adminNotification = await this.sendAdminNewOrderNotification(order);
          console.log(`✅ Admin notification sent: ${results.adminNotification.success}`);
        } catch (error) {
          console.error('❌ Admin notification failed:', error.message);
          results.errors.push(`Admin notification: ${error.message}`);
          results.adminNotification = { success: false, error: error.message };
        }
      } else {
        console.log('⚠️ Admin notifications disabled or admin email not configured');
        results.adminNotification = { success: false, error: 'Admin notifications disabled or admin email not configured' };
      }

      // Send customer notification
      if (this.config.enableCustomerNotifications && this.config.sendCustomerNotifications && order.customerInfo?.email) {
        try {
          results.customerNotification = await this.sendCustomerOrderConfirmation(order);
          console.log(`✅ Customer notification sent: ${results.customerNotification.success}`);
        } catch (error) {
          console.error('❌ Customer notification failed:', error.message);
          results.errors.push(`Customer notification: ${error.message}`);
          results.customerNotification = { success: false, error: error.message };
        }
      } else {
        console.log('⚠️ Customer notifications disabled or customer email not provided');
        results.customerNotification = { success: false, error: 'Customer notifications disabled or customer email not provided' };
      }

      // Determine overall success
      results.success = (results.adminNotification?.success || results.customerNotification?.success);

      if (results.success) {
        console.log(`✅ Order notifications completed for ${order.orderNumber}`);
      } else {
        console.warn(`⚠️ Order notifications partially failed for ${order.orderNumber}:`, results.errors);
      }

      return results;

    } catch (error) {
      console.error('❌ Critical error in order notification service:', error.message);
      results.errors.push(`Critical error: ${error.message}`);
      return results;
    }
  }

  /**
   * Send admin notification for new order
   * @param {Object} order - Order object
   * @returns {Object} - Email result
   */
  async sendAdminNewOrderNotification(order) {
    try {
      const subject = `🚨 NEW ORDER #${order.orderNumber} - ${EmailTemplates.formatCurrency(order.total)} - IMMEDIATE ACTION REQUIRED`;
      
      const htmlContent = EmailTemplates.generateAdminOrderNotificationHTML(order);
      const textContent = EmailTemplates.generateAdminOrderNotificationText(order);

      const result = await this.emailService.sendEmail({
        to: this.config.adminEmail,
        subject,
        html: htmlContent,
        text: textContent,
        priority: 'high', // Mark as high priority
        headers: {
          'X-Priority': '1', // Highest priority
          'Importance': 'high'
        }
      });

      return result;
    } catch (error) {
      console.error('Error sending admin order notification:', error);
      throw error;
    }
  }

  /**
   * Send customer order confirmation
   * @param {Object} order - Order object
   * @returns {Object} - Email result
   */
  async sendCustomerOrderConfirmation(order) {
    try {
      if (!order.customerInfo?.email) {
        throw new Error('Customer email not provided');
      }

      const subject = `Order Confirmation #${order.orderNumber} - Damio Kids`;
      
      const htmlContent = EmailTemplates.generateCustomerOrderConfirmationHTML(order);
      
      // Generate plain text version
      const textContent = this.generateCustomerOrderConfirmationText(order);

      const result = await this.emailService.sendEmail({
        to: order.customerInfo.email,
        subject,
        html: htmlContent,
        text: textContent
      });

      return result;
    } catch (error) {
      console.error('Error sending customer order confirmation:', error);
      throw error;
    }
  }

  /**
   * Send order status update to customer
   * @param {Object} order - Order object
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {string} note - Optional note about the status change
   * @returns {Object} - Email result
   */
  async sendOrderStatusUpdate(order, oldStatus, newStatus, note = '') {
    try {
      if (!this.config.enableCustomerNotifications || !order.customerInfo?.email) {
        console.log('⚠️ Customer status updates disabled or customer email not provided');
        return { success: false, error: 'Customer status updates disabled or customer email not provided' };
      }

      const statusMessages = {
        confirmed: '✅ Your order has been confirmed and is being prepared.',
        processing: '⚙️ Your order is currently being processed.',
        shipped: '🚚 Great news! Your order has been shipped and is on its way!',
        delivered: '✅ Your order has been delivered. Thank you for shopping with us!',
        cancelled: '❌ Your order has been cancelled.',
        returned: '↩️ Your order return has been processed.'
      };

      const subject = `Order Update #${order.orderNumber} - ${EmailTemplates.getStatusDisplay(newStatus)}`;
      
      const htmlContent = this.generateStatusUpdateHTML(order, oldStatus, newStatus, note, statusMessages[newStatus]);
      const textContent = this.generateStatusUpdateText(order, oldStatus, newStatus, note, statusMessages[newStatus]);

      const result = await this.emailService.sendEmail({
        to: order.customerInfo.email,
        subject,
        html: htmlContent,
        text: textContent
      });

      console.log(`📧 Status update sent to ${order.customerInfo.email}: ${oldStatus} → ${newStatus}`);
      return result;

    } catch (error) {
      console.error('Error sending order status update:', error);
      throw error;
    }
  }

  /**
   * Generate customer order confirmation text (plain text version)
   */
  generateCustomerOrderConfirmationText(order) {
    const itemsText = order.items.map(item => 
      `- ${item.name}${item.size ? ` (Size: ${item.size})` : ''}${item.color ? ` (Color: ${item.color})` : ''} × ${item.quantity} - ${EmailTemplates.formatCurrency(item.price)} each = ${EmailTemplates.formatCurrency(item.subtotal)}`
    ).join('\n');

    return `
Order Confirmation - Damio Kids

Dear ${order.customerInfo.name},

Thank you for your order! We've received your order and will begin processing it shortly.

ORDER SUMMARY:
Order Number: ${order.orderNumber}
Order Date: ${EmailTemplates.formatDate(order.date || order.createdAt)}
Payment Method: ${EmailTemplates.getPaymentMethodDisplay(order.paymentMethod)}
Delivery Type: ${order.deliveryType === 'home' ? 'Home Delivery' : 'Store Pickup'}
Status: ${EmailTemplates.getStatusDisplay(order.status)}

YOUR ITEMS:
${itemsText}

ORDER TOTAL:
Subtotal: ${EmailTemplates.formatCurrency(order.subtotal)}
Delivery Fee: ${EmailTemplates.formatCurrency(order.deliveryFee)}
TOTAL: ${EmailTemplates.formatCurrency(order.total)}

${order.deliveryType === 'home' ? 'DELIVERY ADDRESS:' : 'PICKUP INFORMATION:'}
${order.shippingAddress.fullName}
${order.shippingAddress.address}
${order.shippingAddress.commune}, ${order.shippingAddress.wilaya}
${order.shippingAddress.postalCode ? `Postal Code: ${order.shippingAddress.postalCode}\n` : ''}Phone: ${order.shippingAddress.phone}
${order.shippingAddress.notes ? `Special Instructions: ${order.shippingAddress.notes}\n` : ''}

WHAT HAPPENS NEXT:
1. We'll review and confirm your order within 24 hours
2. Your items will be carefully prepared for ${order.deliveryType === 'home' ? 'shipping' : 'pickup'}
3. You'll receive tracking information once your order ships
4. Estimated delivery: ${order.estimatedDeliveryDate ? EmailTemplates.formatDate(order.estimatedDeliveryDate) : '3-5 business days'}

Need help? Contact us at ${process.env.ADMIN_EMAIL || 'support@damiokids.com'}

Thank you for choosing Damio Kids!

Order ID: ${order._id}
This email was sent on ${EmailTemplates.formatDate(new Date())}
    `;
  }

  /**
   * Generate status update HTML
   */
  generateStatusUpdateHTML(order, oldStatus, newStatus, note, statusMessage) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Update - ${order.orderNumber}</title>
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 26px; font-weight: bold;">📋 Order Update</h1>
            <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">Order #${order.orderNumber}</p>
          </div>

          <!-- Content -->
          <div style="padding: 30px;">
            <p style="font-size: 18px; color: #333;">Dear ${order.customerInfo.name},</p>
            
            <div style="background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0; font-size: 16px; color: #155724;">
                <strong>${statusMessage || `Your order status has been updated to: ${EmailTemplates.getStatusDisplay(newStatus)}`}</strong>
              </p>
            </div>

            ${note ? `
              <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #333;">Additional Information:</p>
                <p style="margin: 5px 0 0 0; color: #666;">${note}</p>
              </div>
            ` : ''}

            <!-- Order Details -->
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">Order Details</h3>
              <p><strong>Order Number:</strong> ${order.orderNumber}</p>
              <p><strong>Order Date:</strong> ${EmailTemplates.formatDate(order.date || order.createdAt)}</p>
              <p><strong>Status:</strong> <span style="background-color: #17a2b8; color: white; padding: 4px 8px; border-radius: 4px;">${EmailTemplates.getStatusDisplay(newStatus)}</span></p>
              <p><strong>Total:</strong> ${EmailTemplates.formatCurrency(order.total)}</p>
              ${order.trackingNumber ? `<p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>` : ''}
            </div>

            ${newStatus === 'shipped' && order.trackingNumber ? `
              <div style="background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <h3 style="margin-top: 0; color: #856404;">📦 Tracking Information</h3>
                <p style="color: #856404; margin-bottom: 15px;">Your package is on its way! Track your order with the following information:</p>
                <div style="background-color: #fff; border: 2px dashed #856404; border-radius: 4px; padding: 15px; font-size: 18px; font-weight: bold; color: #856404;">
                  ${order.trackingNumber}
                </div>
              </div>
            ` : ''}

            ${newStatus === 'delivered' ? `
              <div style="background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <h3 style="margin-top: 0; color: #155724;">🎉 Order Delivered!</h3>
                <p style="color: #155724;">We hope you love your new items from Damio Kids!</p>
                <p style="color: #155724; font-size: 14px; margin-top: 15px;">
                  <em>If you have any issues with your order, please contact us within 30 days.</em>
                </p>
              </div>
            ` : ''}

            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #666;">Need help with your order?</p>
              <a href="mailto:${process.env.ADMIN_EMAIL || 'support@damiokids.com'}" 
                 style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                📧 Contact Support
              </a>
            </div>

            <!-- Footer -->
            <div style="text-align: center; margin-top: 40px; padding-top: 30px; border-top: 2px solid #eee; color: #666;">
              <p style="font-size: 16px; font-weight: bold; color: #333; margin-bottom: 10px;">
                Thank you for choosing Damio Kids! 🎈
              </p>
              <p style="font-size: 14px; margin: 5px 0;">
                Order ID: ${order._id}
              </p>
              <p style="font-size: 14px; margin: 5px 0;">
                Status updated on ${EmailTemplates.formatDate(new Date())}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate status update text
   */
  generateStatusUpdateText(order, oldStatus, newStatus, note, statusMessage) {
    return `
Order Status Update - Damio Kids

Dear ${order.customerInfo.name},

${statusMessage || `Your order status has been updated to: ${EmailTemplates.getStatusDisplay(newStatus)}`}

${note ? `Additional Information: ${note}\n` : ''}

ORDER DETAILS:
Order Number: ${order.orderNumber}
Order Date: ${EmailTemplates.formatDate(order.date || order.createdAt)}
Status: ${EmailTemplates.getStatusDisplay(newStatus)}
Total: ${EmailTemplates.formatCurrency(order.total)}
${order.trackingNumber ? `Tracking Number: ${order.trackingNumber}\n` : ''}

${newStatus === 'shipped' && order.trackingNumber ? `
TRACKING INFORMATION:
Your package is on its way! Track your order using: ${order.trackingNumber}
` : ''}

${newStatus === 'delivered' ? `
🎉 ORDER DELIVERED!
We hope you love your new items from Damio Kids!
If you have any issues with your order, please contact us within 30 days.
` : ''}

Need help? Contact us at ${process.env.ADMIN_EMAIL || 'support@damiokids.com'}

Thank you for choosing Damio Kids!

Order ID: ${order._id}
Status updated on ${EmailTemplates.formatDate(new Date())}
    `;
  }

  /**
   * Test email configuration
   * @returns {Object} - Test results
   */
  async testEmailConfiguration() {
    try {
      console.log('🔧 Testing email configuration...');
      
      const testResults = {
        emailService: false,
        adminEmail: false,
        configuration: this.config
      };

      // Test email service connection
      try {
        testResults.emailService = await this.emailService.verifyConnection();
      } catch (error) {
        testResults.emailServiceError = error.message;
      }

      // Test admin email if configured
      if (this.config.adminEmail) {
        try {
          const testResult = await this.emailService.sendEmail({
            to: this.config.adminEmail,
            subject: 'Damio Kids Email Service Test',
            text: `Email service test sent at ${new Date().toISOString()}`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; border: 2px solid #28a745; border-radius: 8px;">
                <h2 style="color: #28a745;">✅ Email Service Test</h2>
                <p>This is a test email from your Damio Kids order notification system.</p>
                <p><strong>Test sent:</strong> ${EmailTemplates.formatDate(new Date())}</p>
                <p><strong>Configuration:</strong></p>
                <ul>
                  <li>Admin notifications: ${this.config.enableAdminNotifications ? 'Enabled' : 'Disabled'}</li>
                  <li>Customer notifications: ${this.config.enableCustomerNotifications ? 'Enabled' : 'Disabled'}</li>
                  <li>Customer confirmations: ${this.config.sendCustomerNotifications ? 'Enabled' : 'Disabled'}</li>
                </ul>
                <p style="color: #666; font-size: 12px;"><em>If you received this email, your notification system is working correctly!</em></p>
              </div>
            `
          });
          
          testResults.adminEmail = testResult.success;
          if (!testResult.success) {
            testResults.adminEmailError = testResult.error;
          }
        } catch (error) {
          testResults.adminEmailError = error.message;
        }
      }

      console.log('📊 Email configuration test results:', testResults);
      return testResults;

    } catch (error) {
      console.error('❌ Email configuration test failed:', error.message);
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      emailService: this.emailService.getStatus ? this.emailService.getStatus() : 'Unknown',
      configuration: this.config,
      ready: !!(this.emailService && (this.config.adminEmail || this.config.enableCustomerNotifications))
    };
  }
}

// Create singleton instance
const orderNotificationService = new OrderNotificationService();

module.exports = orderNotificationService;