# Email Notification System Setup Guide

This guide will help you set up the comprehensive email notification system for Damio Kids, which automatically sends beautiful HTML emails to both admins and customers when orders are placed or updated.

## 🚀 Features

✨ **Admin Order Notifications**: Instant alerts with complete order details, customer info, and action items
✨ **Customer Order Confirmations**: Professional order confirmations with detailed receipts
✨ **Order Status Updates**: Automatic customer notifications when order status changes
✨ **Multiple Email Services**: Support for SMTP (Gmail, Outlook, Custom) and SendGrid
✨ **Beautiful HTML Templates**: Responsive, professional email designs
✨ **Error Handling & Retry**: Robust error handling with automatic retry mechanisms
✨ **Test Endpoints**: Built-in testing tools for email configuration
✨ **Configurable**: Easy to enable/disable different notification types

## 📋 Table of Contents

1. [Quick Setup](#quick-setup)
2. [Email Service Configuration](#email-service-configuration)
3. [Environment Variables](#environment-variables)
4. [Testing the Setup](#testing-the-setup)
5. [Troubleshooting](#troubleshooting)
6. [API Endpoints](#api-endpoints)
7. [Customization](#customization)

## 🔧 Quick Setup

### Step 1: Install Dependencies
The email system uses `nodemailer` which is already included in your `package.json`. No additional dependencies needed!

### Step 2: Configure Environment Variables
Copy the `.env.example` to `.env` and configure the email settings:

```bash
cp .env.example .env
```

### Step 3: Choose Your Email Service
Pick one of these options:

#### Option A: Gmail (Recommended for testing)
```env
# Basic Configuration
ADMIN_EMAIL=your-admin@gmail.com
EMAIL_SERVICE=smtp
FROM_EMAIL=noreply@damiokids.com
FROM_NAME=Damio Kids Store

# Gmail SMTP Settings
SMTP_SERVICE=gmail
SMTP_USER=your-business-email@gmail.com
SMTP_PASS=your-app-password
```

#### Option B: SendGrid (Recommended for production)
```env
# Basic Configuration
ADMIN_EMAIL=your-admin@damiokids.com
EMAIL_SERVICE=sendgrid
FROM_EMAIL=noreply@damiokids.com
FROM_NAME=Damio Kids Store

# SendGrid Settings
SENDGRID_API_KEY=your_sendgrid_api_key
```

### Step 4: Test Your Configuration
1. Start your server: `npm start`
2. Use the admin test endpoint: `POST /api/admin/email/test`
3. Check your admin email for the test message

## 📧 Email Service Configuration

### Gmail Setup

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Mail"
   - Use this password in `SMTP_PASS`

```env
SMTP_SERVICE=gmail
SMTP_USER=your-business@gmail.com
SMTP_PASS=generated-app-password
```

### Outlook/Hotmail Setup

```env
SMTP_SERVICE=outlook
SMTP_USER=your-business@outlook.com
SMTP_PASS=your-password
```

### SendGrid Setup (Professional)

1. **Sign up** at [sendgrid.com](https://sendgrid.com)
2. **Create an API Key**:
   - Go to Settings → API Keys
   - Create API Key with "Full Access" or "Mail Send" permissions
3. **Verify your sender** (domain or single sender)

```env
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=SG.your_api_key_here
```

### Custom SMTP Server

```env
EMAIL_SERVICE=smtp
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-password
```

## ⚙️ Environment Variables Reference

### Required Variables
```env
ADMIN_EMAIL=admin@damiokids.com          # Where admin notifications are sent
EMAIL_SERVICE=smtp                        # 'smtp' or 'sendgrid'
FROM_EMAIL=noreply@damiokids.com         # From address for emails
FROM_NAME=Damio Kids Store               # Display name for emails
```

### SMTP Configuration (if EMAIL_SERVICE=smtp)
```env
SMTP_SERVICE=gmail                       # 'gmail', 'outlook', or leave empty for custom
SMTP_HOST=smtp.gmail.com                # SMTP server host
SMTP_PORT=587                           # SMTP port (usually 587 or 465)
SMTP_SECURE=false                       # true for 465, false for other ports
SMTP_USER=your-email@gmail.com          # SMTP username
SMTP_PASS=your-password                 # SMTP password or app password
```

### SendGrid Configuration (if EMAIL_SERVICE=sendgrid)
```env
SENDGRID_API_KEY=your_sendgrid_api_key  # Your SendGrid API key
```

### Optional Settings
```env
ENABLE_ADMIN_EMAIL_NOTIFICATIONS=true   # Enable/disable admin notifications
ENABLE_CUSTOMER_EMAIL_NOTIFICATIONS=true # Enable/disable customer notifications
SEND_CUSTOMER_ORDER_CONFIRMATION=true   # Enable/disable order confirmations
```

## 🧪 Testing the Setup

### 1. Check Email Service Status
```bash
GET /api/admin/email/status
```
Response:
```json
{
  "success": true,
  "emailService": {
    "emailService": {
      "initialized": true,
      "service": "smtp",
      "adminEmail": "admin@damiokids.com",
      "fromEmail": "noreply@damiokids.com"
    },
    "configuration": {
      "adminEmail": "admin@damiokids.com",
      "enableAdminNotifications": true,
      "enableCustomerNotifications": true
    },
    "ready": true
  }
}
```

### 2. Test Email Configuration
```bash
POST /api/admin/email/test
```
This sends a test email to your admin address.

### 3. Test Order Notification
```bash
POST /api/admin/email/send-test-notification
Content-Type: application/json

{
  "orderId": "order_id_here",
  "type": "admin"  // or "customer"
}
```

### 4. Place a Test Order
Use your frontend or API to place a test order and verify emails are sent automatically.

## 🔍 Troubleshooting

### Common Issues

#### 1. "Authentication failed" with Gmail
**Solution**: Use App Password, not your regular password.
- Enable 2FA on your Google account
- Generate an App Password in Google Account settings
- Use the App Password in `SMTP_PASS`

#### 2. "Connection timeout" or "ECONNREFUSED"
**Solutions**:
- Check your SMTP host and port settings
- Verify your network/firewall allows SMTP connections
- Try different ports (587, 465, 25)

#### 3. Emails go to spam folder
**Solutions**:
- Set up SPF, DKIM, and DMARC records for your domain
- Use a verified sender email address
- Consider using SendGrid for better deliverability

#### 4. "Email service not configured"
**Solutions**:
- Ensure `ADMIN_EMAIL` is set
- Check that `EMAIL_SERVICE` is set to 'smtp' or 'sendgrid'
- Verify SMTP credentials or SendGrid API key

### Debug Mode
Set `NODE_ENV=development` to see detailed email logs and Ethereal email previews for testing.

### Log Analysis
Check your server logs for detailed error messages:
- ✅ = Success
- ⚠️ = Warning (non-critical)
- ❌ = Error (needs attention)

## 🔌 API Endpoints

### Admin Endpoints (Require Authentication)

#### Get Email Service Status
```
GET /api/admin/email/status
```

#### Test Email Configuration
```
POST /api/admin/email/test
```

#### Send Test Notification
```
POST /api/admin/email/send-test-notification
Body: { "orderId": "string", "type": "admin|customer" }
```

### Order Endpoints

#### Enhanced Place Order (Includes Email Notifications)
```
POST /placeorder
Body: {
  "items": [...],
  "subtotal": number,
  "deliveryFee": number,
  "total": number,
  "customerInfo": {
    "name": "string",
    "email": "string",
    "phone": "string"
  },
  "shippingAddress": {
    "fullName": "string",
    "phone": "string",
    "address": "string",
    "wilaya": "string",
    "commune": "string",
    "postalCode": "string",
    "notes": "string"
  },
  "deliveryType": "home|pickup",
  "paymentMethod": "cash_on_delivery|bank_transfer|card_payment",
  "userId": "string"
}
```

#### Update Order Status (Includes Status Update Emails)
```
POST /admin/updateorder
Body: {
  "orderId": "string",
  "status": "pending|confirmed|processing|shipped|delivered|cancelled",
  "note": "string"
}
```

## 🎨 Customization

### Email Templates
Templates are located in `/services/emailTemplates.js`. You can customize:
- Colors and styling
- Content and messaging
- Layout and structure
- Currency formatting
- Date formatting

### Email Content
Modify the `orderNotificationService.js` to change:
- Email subjects
- Status messages
- Notification triggers

### Example Customization - Change Email Colors
```javascript
// In emailTemplates.js
// Change the header color from blue to your brand color
<div style="background: linear-gradient(135deg, #YOUR_COLOR 0%, #YOUR_DARKER_COLOR 100%); ...">
```

## 📊 Email Templates Overview

### Admin New Order Notification
- 🎯 **Purpose**: Alert admin immediately when new order is placed
- 📧 **Subject**: `🚨 NEW ORDER #ORDER_NUMBER - TOTAL - IMMEDIATE ACTION REQUIRED`
- 📋 **Contains**: Full order details, customer info, shipping address, action items
- 🎨 **Design**: Professional blue theme with clear action buttons

### Customer Order Confirmation
- 🎯 **Purpose**: Confirm order placement to customer
- 📧 **Subject**: `Order Confirmation #ORDER_NUMBER - Damio Kids`
- 📋 **Contains**: Order summary, items, total, shipping info, next steps
- 🎨 **Design**: Friendly green theme with thank you message

### Customer Status Updates
- 🎯 **Purpose**: Notify customer of order status changes
- 📧 **Subject**: `Order Update #ORDER_NUMBER - NEW_STATUS`
- 📋 **Contains**: Status change info, tracking details (if applicable)
- 🎨 **Design**: Clean info theme with status-specific content

## 🚀 Production Recommendations

1. **Use SendGrid** for better deliverability and analytics
2. **Set up domain authentication** (SPF, DKIM, DMARC)
3. **Monitor email bounce rates** and maintain sender reputation
4. **Enable all notification types** for complete order management
5. **Regularly test** email functionality
6. **Set up email monitoring** and alerting

## 📞 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Review server logs for error details
3. Test with the provided endpoints
4. Verify environment variable configuration
5. Check email service status

The email notification system is designed to be robust and fail gracefully - if emails fail, orders will still be processed successfully.

## 🎉 Success!

Once configured, you'll have:
- ✅ Automatic admin notifications for every new order
- ✅ Beautiful customer order confirmations
- ✅ Status update notifications
- ✅ Professional email templates
- ✅ Robust error handling
- ✅ Easy testing and monitoring

Your customers will love the professional communication, and you'll never miss an order again! 🎈