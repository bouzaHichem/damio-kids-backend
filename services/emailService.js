const nodemailer = require('nodemailer');
const { ValidationError } = require('../middleware/errorHandler');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }
  
  /**
   * Initialize email transporter based on environment
   */
  initializeTransporter() {
    // Check if email service is configured
    if (!process.env.EMAIL_SERVICE && !process.env.SMTP_HOST) {
      console.warn('Email service not configured. Email notifications will be disabled.');
      return;
    }
    
    try {
      if (process.env.EMAIL_SERVICE === 'gmail') {
        // Gmail service configuration
        this.transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD // Use App Password for Gmail
          }
        });
      } else if (process.env.SMTP_HOST) {
        // Custom SMTP configuration
        this.transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
      } else {
        // Development mode - use Ethereal Email (fake SMTP service)
        this.setupEtherealEmail();
      }
      
      console.log('Email service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize email service:', error.message);
    }
  }
  
  /**
   * Setup Ethereal Email for development/testing
   */
  async setupEtherealEmail() {
    try {
      const testAccount = await nodemailer.createTestAccount();
      
      this.transporter = nodemailer.createTransporter({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      
      console.log('Ethereal Email configured for development');
      console.log(`Test email credentials: ${testAccount.user} / ${testAccount.pass}`);
    } catch (error) {
      console.error('Failed to setup Ethereal Email:', error.message);
    }
  }
  
  /**
   * Send email with error handling and logging
   * @param {Object} mailOptions - Email options
   */
  async sendEmail(mailOptions) {
    if (!this.transporter) {
      console.warn('Email service not available. Email not sent:', mailOptions.subject);
      return { success: false, reason: 'Email service not configured' };
    }
    
    try {
      // Add default sender if not specified
      if (!mailOptions.from) {
        mailOptions.from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@damiokids.com';
      }
      
      const result = await this.transporter.sendMail(mailOptions);
      
      console.log('Email sent successfully:', {
        messageId: result.messageId,
        to: mailOptions.to,
        subject: mailOptions.subject
      });
      
      // Log preview URL for development
      if (process.env.NODE_ENV === 'development' && result.messageId.includes('ethereal')) {
        console.log('Preview URL:', nodemailer.getTestMessageUrl(result));
      }
      
      return { success: true, messageId: result.messageId, result };
    } catch (error) {
      console.error('Failed to send email:', error.message);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send order confirmation email
   * @param {Object} order - Order object
   * @param {Object} customer - Customer information
   */
  async sendOrderConfirmation(order, customer) {
    const subject = `Order Confirmation #${order.orderNumber} - Damio Kids`;
    
    const html = this.generateOrderConfirmationHTML(order, customer);
    const text = this.generateOrderConfirmationText(order, customer);
    
    const mailOptions = {
      to: customer.email,
      subject,
      html,
      text
    };
    
    return await this.sendEmail(mailOptions);
  }
  
  /**
   * Send order status update email
   * @param {Object} order - Order object
   * @param {Object} customer - Customer information
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   */
  async sendOrderStatusUpdate(order, customer, oldStatus, newStatus) {
    const statusMessages = {
      confirmed: 'Your order has been confirmed and is being prepared.',
      processing: 'Your order is currently being processed.',
      shipped: 'Your order has been shipped and is on its way!',
      delivered: 'Your order has been delivered. Thank you for shopping with us!',
      cancelled: 'Your order has been cancelled.'
    };
    
    const subject = `Order Update #${order.orderNumber} - ${this.capitalizeFirst(newStatus)}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Order Status Update</h2>
        
        <p>Dear ${customer.name},</p>
        
        <p>${statusMessages[newStatus] || `Your order status has been updated to: ${newStatus}`}</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Order Details:</h3>
          <p><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p><strong>Order Date:</strong> ${new Date(order.date).toLocaleDateString()}</p>
          <p><strong>Total:</strong> ${order.total} DZD</p>
          <p><strong>Status:</strong> ${this.capitalizeFirst(newStatus)}</p>
        </div>
        
        ${order.trackingNumber ? `
          <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Tracking Information:</h3>
            <p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>
          </div>
        ` : ''}
        
        <p>If you have any questions about your order, please contact us.</p>
        
        <p>Thank you for choosing Damio Kids!</p>
      </div>
    `;
    
    const mailOptions = {
      to: customer.email,
      subject,
      html
    };
    
    return await this.sendEmail(mailOptions);
  }
  
  /**
   * Send low stock alert to admins
   * @param {Object} product - Product object
   */
  async sendLowStockAlert(product) {
    const adminEmails = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.split(',') : [];
    
    if (adminEmails.length === 0) {
      console.warn('No admin emails configured for low stock alerts');
      return { success: false, reason: 'No admin emails configured' };
    }
    
    const subject = `LOW STOCK ALERT: ${product.name} (${product.stock_quantity} left)`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin-bottom: 20px;">
          <h2 style="color: #856404; margin-top: 0;">⚠️ Low Stock Alert</h2>
        </div>
        
        <p>The following product is running low on stock:</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
          <h3 style="margin-top: 0;">${product.name}</h3>
          <p><strong>Product ID:</strong> ${product.id}</p>
          <p><strong>Category:</strong> ${product.category}</p>
          <p><strong>Current Stock:</strong> ${product.stock_quantity}</p>
          <p><strong>Price:</strong> ${product.new_price} DZD</p>
          ${product.brand ? `<p><strong>Brand:</strong> ${product.brand}</p>` : ''}
        </div>
        
        <p>Please consider restocking this item to avoid stockouts.</p>
        
        <p><em>This is an automated alert from Damio Kids inventory management system.</em></p>
      </div>
    `;
    
    const mailOptions = {
      to: adminEmails.join(','),
      subject,
      html
    };
    
    return await this.sendEmail(mailOptions);
  }
  
  /**
   * Send welcome email to new customers
   * @param {Object} user - User object
   */
  async sendWelcomeEmail(user) {
    const subject = 'Welcome to Damio Kids!';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333;">Welcome to Damio Kids!</h1>
        </div>
        
        <p>Dear ${user.name},</p>
        
        <p>Thank you for joining Damio Kids! We're excited to have you as part of our family.</p>
        
        <div style="background-color: #e7f3ff; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">What's Next?</h3>
          <ul>
            <li>Browse our collection of quality children's clothing</li>
            <li>Enjoy free delivery on orders over 5000 DZD</li>
            <li>Get exclusive offers and early access to new collections</li>
            <li>Track your orders easily through your account</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://damiokids.com'}" 
             style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px;">
            Start Shopping
          </a>
        </div>
        
        <p>If you have any questions, feel free to contact our customer service team.</p>
        
        <p>Happy shopping!</p>
        <p>The Damio Kids Team</p>
      </div>
    `;
    
    const mailOptions = {
      to: user.email,
      subject,
      html
    };
    
    return await this.sendEmail(mailOptions);
  }
  
  /**
   * Send password reset email
   * @param {Object} user - User object
   * @param {string} resetToken - Reset token
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const subject = 'Password Reset Request - Damio Kids';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        
        <p>Dear ${user.name},</p>
        
        <p>You recently requested to reset your password for your Damio Kids account.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #dc3545; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px;">
            Reset Password
          </a>
        </div>
        
        <p>If you did not request a password reset, please ignore this email or contact support if you have questions.</p>
        
        <p><strong>This link will expire in 1 hour.</strong></p>
        
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        
        <p>Best regards,<br>The Damio Kids Team</p>
      </div>
    `;
    
    const mailOptions = {
      to: user.email,
      subject,
      html
    };
    
    return await this.sendEmail(mailOptions);
  }
  
  /**
   * Generate order confirmation HTML
   * @param {Object} order - Order object
   * @param {Object} customer - Customer information
   */
  generateOrderConfirmationHTML(order, customer) {
    const itemsHTML = order.items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; margin-right: 10px;">
          ${item.name}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${item.price} DZD</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${item.subtotal} DZD</td>
      </tr>
    `).join('');
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333;">Order Confirmation</h1>
          <h2 style="color: #666;">Order #${order.orderNumber}</h2>
        </div>
        
        <p>Dear ${customer.name},</p>
        
        <p>Thank you for your order! We've received your order and will process it shortly.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Order Details:</h3>
          <p><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p><strong>Order Date:</strong> ${new Date(order.date).toLocaleDateString()}</p>
          <p><strong>Delivery Type:</strong> ${order.deliveryType === 'home' ? 'Home Delivery' : 'Pickup'}</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 10px; text-align: left;">Item</th>
              <th style="padding: 10px; text-align: center;">Qty</th>
              <th style="padding: 10px; text-align: right;">Price</th>
              <th style="padding: 10px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
        
        <div style="text-align: right; margin: 20px 0;">
          <p><strong>Subtotal: ${order.subtotal} DZD</strong></p>
          <p><strong>Delivery Fee: ${order.deliveryFee} DZD</strong></p>
          <h3 style="color: #333; margin: 10px 0;"><strong>Total: ${order.total} DZD</strong></h3>
        </div>
        
        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Delivery Address:</h3>
          <p>${order.shippingAddress.fullName}</p>
          <p>${order.shippingAddress.address}</p>
          <p>${order.shippingAddress.commune}, ${order.shippingAddress.wilaya}</p>
          <p>Phone: ${order.shippingAddress.phone}</p>
        </div>
        
        <p>We'll send you another email when your order ships.</p>
        
        <p>Thank you for choosing Damio Kids!</p>
      </div>
    `;
  }
  
  /**
   * Generate order confirmation text (plain text version)
   * @param {Object} order - Order object
   * @param {Object} customer - Customer information
   */
  generateOrderConfirmationText(order, customer) {
    const itemsText = order.items.map(item => 
      `${item.name} - Qty: ${item.quantity} - ${item.price} DZD each - Subtotal: ${item.subtotal} DZD`
    ).join('\n');
    
    return `
Order Confirmation - Order #${order.orderNumber}

Dear ${customer.name},

Thank you for your order! We've received your order and will process it shortly.

Order Details:
- Order Number: ${order.orderNumber}
- Order Date: ${new Date(order.date).toLocaleDateString()}
- Delivery Type: ${order.deliveryType === 'home' ? 'Home Delivery' : 'Pickup'}

Items Ordered:
${itemsText}

Order Summary:
Subtotal: ${order.subtotal} DZD
Delivery Fee: ${order.deliveryFee} DZD
TOTAL: ${order.total} DZD

Delivery Address:
${order.shippingAddress.fullName}
${order.shippingAddress.address}
${order.shippingAddress.commune}, ${order.shippingAddress.wilaya}
Phone: ${order.shippingAddress.phone}

We'll send you another email when your order ships.

Thank you for choosing Damio Kids!
    `;
  }
  
  /**
   * Utility function to capitalize first letter
   * @param {string} str - String to capitalize
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Export singleton instance
module.exports = new EmailService();
