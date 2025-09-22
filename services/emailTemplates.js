/**
 * Email Templates for Order Notifications
 * Provides reusable HTML and text templates for admin and customer notifications
 */

class EmailTemplates {
  /**
   * Format currency for display
   */
  static formatCurrency(amount, currency = 'DZD') {
    if (typeof amount !== 'number') {
      amount = parseFloat(amount) || 0;
    }
    
    return new Intl.NumberFormat('ar-DZ', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Format date for display
   */
  static formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Algiers'
    }).format(new Date(date));
  }

  /**
   * Get status display name
   */
  static getStatusDisplay(status) {
    const statusMap = {
      'pending': 'Pending Confirmation',
      'confirmed': 'Confirmed',
      'processing': 'Processing',
      'shipped': 'Shipped',
      'delivered': 'Delivered',
      'cancelled': 'Cancelled',
      'returned': 'Returned'
    };
    return statusMap[status] || status;
  }

  /**
   * Generate admin notification HTML for new order
   */
  static generateAdminOrderNotificationHTML(order) {
    const itemsHTML = order.items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <div style="display: flex; align-items: center;">
            <img src="${item.image}" alt="${item.name}" 
                 style="width: 50px; height: 50px; object-fit: cover; margin-right: 10px; border-radius: 4px;">
            <div>
              <strong>${item.name}</strong><br>
              ${item.size ? `Size: ${item.size}<br>` : ''}
              ${item.color ? `Color: ${item.color}<br>` : ''}
              SKU: ${item.productId}
            </div>
          </div>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
          ${item.quantity}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
          ${this.formatCurrency(item.price)}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
          <strong>${this.formatCurrency(item.subtotal)}</strong>
        </td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Order Alert - ${order.orderNumber}</title>
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 800px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: bold;">🎉 NEW ORDER RECEIVED!</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Order #${order.orderNumber}</p>
          </div>

          <!-- Alert Bar -->
          <div style="background-color: #28a745; color: white; padding: 15px; text-align: center; font-weight: bold;">
            📋 IMMEDIATE ATTENTION REQUIRED - PROCESS THIS ORDER
          </div>

          <!-- Order Summary -->
          <div style="padding: 30px;">
            <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 20px; margin-bottom: 30px; border-radius: 0 8px 8px 0;">
              <h2 style="margin-top: 0; color: #333; font-size: 20px;">📋 Order Summary</h2>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                  <p><strong>Order Number:</strong> ${order.orderNumber}</p>
                  <p><strong>Order Date:</strong> ${this.formatDate(order.date || order.createdAt)}</p>
                  <p><strong>Payment Method:</strong> ${this.getPaymentMethodDisplay(order.paymentMethod)}</p>
                  <p><strong>Delivery Type:</strong> ${order.deliveryType === 'home' ? '🏠 Home Delivery' : '🏪 Store Pickup'}</p>
                </div>
                <div>
                  <p><strong>Order Status:</strong> <span style="background-color: #ffc107; padding: 4px 8px; border-radius: 4px; color: #000;">${this.getStatusDisplay(order.status)}</span></p>
                  <p><strong>Total Items:</strong> ${order.items.reduce((sum, item) => sum + item.quantity, 0)}</p>
                  <p><strong>Order Value:</strong> <span style="color: #28a745; font-size: 18px; font-weight: bold;">${this.formatCurrency(order.total)}</span></p>
                  ${order.estimatedDeliveryDate ? `<p><strong>Est. Delivery:</strong> ${this.formatDate(order.estimatedDeliveryDate)}</p>` : ''}
                </div>
              </div>
            </div>

            <!-- Customer Information -->
            <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
              <h3 style="margin-top: 0; color: #1565c0; display: flex; align-items: center;">
                👤 Customer Information
              </h3>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                  <p><strong>Name:</strong> ${order.customerInfo.name}</p>
                  <p><strong>Email:</strong> <a href="mailto:${order.customerInfo.email}" style="color: #007bff;">${order.customerInfo.email}</a></p>
                  <p><strong>Phone:</strong> <a href="tel:${order.customerInfo.phone}" style="color: #007bff;">${order.customerInfo.phone}</a></p>
                </div>
                <div>
                  <p><strong>Customer ID:</strong> ${order.userId}</p>
                  <p><strong>Registration:</strong> ${order.userId === 'guest' ? 'Guest Checkout' : 'Registered User'}</p>
                </div>
              </div>
            </div>

            <!-- Shipping Address -->
            <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
              <h3 style="margin-top: 0; color: #f57c00; display: flex; align-items: center;">
                🚚 Shipping Address
              </h3>
              <div style="font-size: 16px; line-height: 1.6;">
                <p style="margin: 5px 0;"><strong>${order.shippingAddress.fullName}</strong></p>
                <p style="margin: 5px 0;">${order.shippingAddress.address}</p>
                <p style="margin: 5px 0;">${order.shippingAddress.commune}, ${order.shippingAddress.wilaya}</p>
                ${order.shippingAddress.postalCode ? `<p style="margin: 5px 0;">Postal Code: ${order.shippingAddress.postalCode}</p>` : ''}
                <p style="margin: 5px 0;">📱 <a href="tel:${order.shippingAddress.phone}" style="color: #f57c00;">${order.shippingAddress.phone}</a></p>
                ${order.shippingAddress.notes ? `<p style="margin: 10px 0; padding: 10px; background-color: #fff8e1; border-radius: 4px;"><strong>Special Notes:</strong> ${order.shippingAddress.notes}</p>` : ''}
              </div>
            </div>

            <!-- Order Items -->
            <div style="margin-bottom: 30px;">
              <h3 style="color: #333; display: flex; align-items: center; margin-bottom: 20px;">
                📦 Order Items (${order.items.length} item${order.items.length !== 1 ? 's' : ''})
              </h3>
              
              <table style="width: 100%; border-collapse: collapse; background-color: #fafafa; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <thead>
                  <tr style="background-color: #343a40; color: white;">
                    <th style="padding: 15px; text-align: left;">Product Details</th>
                    <th style="padding: 15px; text-align: center;">Quantity</th>
                    <th style="padding: 15px; text-align: right;">Unit Price</th>
                    <th style="padding: 15px; text-align: right;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHTML}
                </tbody>
              </table>
            </div>

            <!-- Financial Summary -->
            <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
              <h3 style="margin-top: 0; color: #2e7d32;">💰 Financial Breakdown</h3>
              <div style="font-size: 16px;">
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #c8e6c9;">
                  <span>Subtotal:</span>
                  <span>${this.formatCurrency(order.subtotal)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #c8e6c9;">
                  <span>Delivery Fee:</span>
                  <span>${this.formatCurrency(order.deliveryFee)}</span>
                </div>
                ${order.financials?.orderDiscount ? `
                  <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #c8e6c9; color: #d32f2f;">
                    <span>Discount:</span>
                    <span>-${this.formatCurrency(order.financials.orderDiscount)}</span>
                  </div>
                ` : ''}
                ${order.financials?.taxAmount ? `
                  <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #c8e6c9;">
                    <span>Tax:</span>
                    <span>${this.formatCurrency(order.financials.taxAmount)}</span>
                  </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; padding: 15px 0; font-size: 20px; font-weight: bold; background-color: #2e7d32; color: white; margin: 10px -20px -20px -20px; padding-left: 20px; padding-right: 20px;">
                  <span>TOTAL ORDER VALUE:</span>
                  <span>${this.formatCurrency(order.total)}</span>
                </div>
              </div>
            </div>

            <!-- Action Required -->
            <div style="background-color: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
              <h3 style="margin-top: 0; color: #856404; display: flex; align-items: center;">
                ⚡ Immediate Actions Required
              </h3>
              <ul style="margin: 10px 0; color: #856404;">
                <li><strong>Verify inventory availability</strong> for all ordered items</li>
                <li><strong>Process payment</strong> (${this.getPaymentMethodDisplay(order.paymentMethod)})</li>
                <li><strong>Update order status</strong> to "Confirmed" after verification</li>
                <li><strong>Prepare items</strong> for ${order.deliveryType === 'home' ? 'shipping' : 'pickup'}</li>
                <li><strong>Send customer update</strong> with tracking information (if applicable)</li>
              </ul>
            </div>

            <!-- Quick Actions -->
            <div style="text-align: center; margin-bottom: 30px;">
              <p style="margin-bottom: 20px; color: #666; font-size: 16px;">Quick Actions:</p>
              <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                <a href="mailto:${order.customerInfo.email}?subject=Order%20Update%20-%20${order.orderNumber}" 
                   style="background-color: #17a2b8; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  📧 Email Customer
                </a>
                <a href="tel:${order.customerInfo.phone}" 
                   style="background-color: #28a745; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  📞 Call Customer
                </a>
                ${process.env.ADMIN_URL ? `
                  <a href="${process.env.ADMIN_URL}/orders/${order._id}" 
                     style="background-color: #007bff; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                    🔧 Manage Order
                  </a>
                ` : ''}
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; color: #666;">
              <p style="margin: 0; font-size: 14px;">
                <strong>Order ID:</strong> ${order._id}<br>
                <strong>Notification sent:</strong> ${this.formatDate(new Date())}<br>
                <em>This is an automated notification from Damio Kids Order Management System</em>
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate admin notification text for new order
   */
  static generateAdminOrderNotificationText(order) {
    const itemsText = order.items.map(item => 
      `- ${item.name} (${item.size ? `Size: ${item.size}, ` : ''}${item.color ? `Color: ${item.color}, ` : ''}Qty: ${item.quantity}) - ${this.formatCurrency(item.price)} each = ${this.formatCurrency(item.subtotal)}`
    ).join('\n');

    return `
🎉 NEW ORDER RECEIVED - IMMEDIATE ATTENTION REQUIRED

Order #${order.orderNumber}
Order Date: ${this.formatDate(order.date || order.createdAt)}
Status: ${this.getStatusDisplay(order.status)}

CUSTOMER INFORMATION:
Name: ${order.customerInfo.name}
Email: ${order.customerInfo.email}
Phone: ${order.customerInfo.phone}
Customer Type: ${order.userId === 'guest' ? 'Guest Checkout' : 'Registered User'}

SHIPPING ADDRESS:
${order.shippingAddress.fullName}
${order.shippingAddress.address}
${order.shippingAddress.commune}, ${order.shippingAddress.wilaya}
${order.shippingAddress.postalCode ? `Postal Code: ${order.shippingAddress.postalCode}\n` : ''}Phone: ${order.shippingAddress.phone}
${order.shippingAddress.notes ? `Special Notes: ${order.shippingAddress.notes}\n` : ''}

ORDERED ITEMS (${order.items.length} item${order.items.length !== 1 ? 's' : ''}):
${itemsText}

FINANCIAL SUMMARY:
Subtotal: ${this.formatCurrency(order.subtotal)}
Delivery Fee: ${this.formatCurrency(order.deliveryFee)}
${order.financials?.orderDiscount ? `Discount: -${this.formatCurrency(order.financials.orderDiscount)}\n` : ''}${order.financials?.taxAmount ? `Tax: ${this.formatCurrency(order.financials.taxAmount)}\n` : ''}TOTAL ORDER VALUE: ${this.formatCurrency(order.total)}

DELIVERY DETAILS:
Type: ${order.deliveryType === 'home' ? 'Home Delivery' : 'Store Pickup'}
Payment Method: ${this.getPaymentMethodDisplay(order.paymentMethod)}
${order.estimatedDeliveryDate ? `Estimated Delivery: ${this.formatDate(order.estimatedDeliveryDate)}\n` : ''}

IMMEDIATE ACTIONS REQUIRED:
1. Verify inventory availability for all ordered items
2. Process payment (${this.getPaymentMethodDisplay(order.paymentMethod)})
3. Update order status to "Confirmed" after verification
4. Prepare items for ${order.deliveryType === 'home' ? 'shipping' : 'pickup'}
5. Send customer update with tracking information (if applicable)

Order ID: ${order._id}
Notification sent: ${this.formatDate(new Date())}

This is an automated notification from Damio Kids Order Management System.
    `;
  }

  /**
   * Generate customer order confirmation HTML
   */
  static generateCustomerOrderConfirmationHTML(order) {
    const itemsHTML = order.items.map(item => `
      <tr>
        <td style="padding: 15px; border-bottom: 1px solid #eee;">
          <div style="display: flex; align-items: center;">
            <img src="${item.image}" alt="${item.name}" 
                 style="width: 60px; height: 60px; object-fit: cover; margin-right: 15px; border-radius: 6px;">
            <div>
              <h4 style="margin: 0; color: #333;">${item.name}</h4>
              ${item.size ? `<p style="margin: 2px 0; color: #666; font-size: 14px;">Size: ${item.size}</p>` : ''}
              ${item.color ? `<p style="margin: 2px 0; color: #666; font-size: 14px;">Color: ${item.color}</p>` : ''}
            </div>
          </div>
        </td>
        <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold;">
          ${item.quantity}
        </td>
        <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: right;">
          ${this.formatCurrency(item.price)}
        </td>
        <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; color: #28a745;">
          ${this.formatCurrency(item.subtotal)}
        </td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation - ${order.orderNumber}</title>
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5;">
        <div style="max-width: 700px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 40px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">✅ Order Confirmed!</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Thank you for your purchase</p>
            <p style="margin: 10px 0 0 0; font-size: 20px; font-weight: bold;">Order #${order.orderNumber}</p>
          </div>

          <!-- Content -->
          <div style="padding: 40px;">
            <p style="font-size: 18px; color: #333;">Dear ${order.customerInfo.name},</p>
            
            <p style="font-size: 16px; color: #666; margin-bottom: 30px;">
              Thank you for your order! We've received your order and will begin processing it shortly. 
              You'll receive another email when your order ships.
            </p>

            <!-- Order Summary -->
            <div style="background-color: #f8f9fa; border-left: 4px solid #28a745; padding: 25px; margin-bottom: 30px; border-radius: 0 8px 8px 0;">
              <h2 style="margin-top: 0; color: #333; font-size: 20px;">📋 Order Summary</h2>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                  <p><strong>Order Number:</strong> ${order.orderNumber}</p>
                  <p><strong>Order Date:</strong> ${this.formatDate(order.date || order.createdAt)}</p>
                  <p><strong>Payment Method:</strong> ${this.getPaymentMethodDisplay(order.paymentMethod)}</p>
                </div>
                <div>
                  <p><strong>Delivery Type:</strong> ${order.deliveryType === 'home' ? '🏠 Home Delivery' : '🏪 Store Pickup'}</p>
                  <p><strong>Status:</strong> <span style="background-color: #ffc107; padding: 4px 8px; border-radius: 4px; color: #000;">${this.getStatusDisplay(order.status)}</span></p>
                  ${order.estimatedDeliveryDate ? `<p><strong>Estimated Delivery:</strong> ${this.formatDate(order.estimatedDeliveryDate)}</p>` : ''}
                </div>
              </div>
            </div>

            <!-- Order Items -->
            <div style="margin-bottom: 30px;">
              <h3 style="color: #333; margin-bottom: 20px;">📦 Your Items</h3>
              
              <table style="width: 100%; border-collapse: collapse; background-color: #fafafa; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <thead>
                  <tr style="background-color: #343a40; color: white;">
                    <th style="padding: 15px; text-align: left;">Item</th>
                    <th style="padding: 15px; text-align: center;">Qty</th>
                    <th style="padding: 15px; text-align: right;">Price</th>
                    <th style="padding: 15px; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHTML}
                </tbody>
              </table>
            </div>

            <!-- Order Total -->
            <div style="background-color: #e8f5e8; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
              <h3 style="margin-top: 0; color: #2e7d32;">💰 Order Total</h3>
              <div style="font-size: 16px;">
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #c8e6c9;">
                  <span>Subtotal:</span>
                  <span>${this.formatCurrency(order.subtotal)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #c8e6c9;">
                  <span>Delivery Fee:</span>
                  <span>${this.formatCurrency(order.deliveryFee)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 15px 0; font-size: 20px; font-weight: bold; background-color: #2e7d32; color: white; margin: 10px -25px -25px -25px; padding-left: 25px; padding-right: 25px;">
                  <span>Total:</span>
                  <span>${this.formatCurrency(order.total)}</span>
                </div>
              </div>
            </div>

            <!-- Shipping Address -->
            <div style="background-color: #fff3e0; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
              <h3 style="margin-top: 0; color: #f57c00;">🚚 ${order.deliveryType === 'home' ? 'Delivery Address' : 'Pickup Information'}</h3>
              <div style="font-size: 16px; line-height: 1.6;">
                <p style="margin: 5px 0;"><strong>${order.shippingAddress.fullName}</strong></p>
                <p style="margin: 5px 0;">${order.shippingAddress.address}</p>
                <p style="margin: 5px 0;">${order.shippingAddress.commune}, ${order.shippingAddress.wilaya}</p>
                ${order.shippingAddress.postalCode ? `<p style="margin: 5px 0;">Postal Code: ${order.shippingAddress.postalCode}</p>` : ''}
                <p style="margin: 5px 0;">📱 ${order.shippingAddress.phone}</p>
                ${order.shippingAddress.notes ? `<p style="margin: 15px 0 5px 0; padding: 15px; background-color: #fff8e1; border-radius: 4px;"><strong>Special Instructions:</strong><br>${order.shippingAddress.notes}</p>` : ''}
              </div>
            </div>

            <!-- Next Steps -->
            <div style="background-color: #e3f2fd; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
              <h3 style="margin-top: 0; color: #1565c0;">📋 What Happens Next?</h3>
              <ul style="color: #333; font-size: 16px; line-height: 1.8;">
                <li>We'll review and confirm your order within 24 hours</li>
                <li>Your items will be carefully prepared for ${order.deliveryType === 'home' ? 'shipping' : 'pickup'}</li>
                <li>You'll receive tracking information once your order ships</li>
                <li>Estimated delivery: ${order.estimatedDeliveryDate ? this.formatDate(order.estimatedDeliveryDate) : '3-5 business days'}</li>
              </ul>
            </div>

            <!-- Contact Info -->
            <div style="text-align: center; padding: 25px; background-color: #f8f9fa; border-radius: 8px;">
              <h3 style="margin-top: 0; color: #333;">Need Help?</h3>
              <p style="margin: 10px 0; color: #666;">
                If you have any questions about your order, feel free to contact us:
              </p>
              <div style="margin: 20px 0;">
                <a href="mailto:${process.env.ADMIN_EMAIL || 'support@damiokids.com'}" 
                   style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin: 0 10px; font-weight: bold; display: inline-block;">
                  📧 Email Support
                </a>
                ${order.customerInfo.phone ? `
                  <a href="tel:${order.customerInfo.phone}" 
                     style="background-color: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; margin: 0 10px; font-weight: bold; display: inline-block;">
                    📞 Call Us
                  </a>
                ` : ''}
              </div>
            </div>

            <!-- Footer -->
            <div style="text-align: center; margin-top: 40px; padding-top: 30px; border-top: 2px solid #eee; color: #666;">
              <p style="font-size: 18px; font-weight: bold; color: #333; margin-bottom: 10px;">
                Thank you for choosing Damio Kids! 🎈
              </p>
              <p style="font-size: 14px; margin: 5px 0;">
                Order ID: ${order._id}
              </p>
              <p style="font-size: 14px; margin: 5px 0;">
                This email was sent on ${this.formatDate(new Date())}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get payment method display name
   */
  static getPaymentMethodDisplay(method) {
    const methods = {
      'cash_on_delivery': '💵 Cash on Delivery',
      'bank_transfer': '🏦 Bank Transfer',
      'card_payment': '💳 Card Payment'
    };
    return methods[method] || method;
  }
}

module.exports = EmailTemplates;