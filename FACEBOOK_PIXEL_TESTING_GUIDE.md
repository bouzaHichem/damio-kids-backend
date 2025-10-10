# Facebook Pixel & Conversions API Testing Guide

This guide will help you test the Facebook Pixel (client-side) and Conversions API (server-side) implementation to ensure accurate event tracking.

## 🔧 Initial Setup

### 1. Configure Environment Variables

**Frontend (.env):**
```bash
REACT_APP_FACEBOOK_PIXEL_ID=XXXXXXXXXXXXXXX
REACT_APP_BACKEND_URL=your_backend_url
```

**Backend (.env):**
```bash
FACEBOOK_PIXEL_ID=XXXXXXXXXXXXXXX
FACEBOOK_ACCESS_TOKEN=your_facebook_access_token_here
```

### 2. Replace Placeholder Pixel ID

Update the Pixel ID in both:
- **Frontend**: `public/index.html` (line ~27 and ~35)
- **Backend**: Environment variables

---

## 🧪 Testing Methods

### Method 1: Facebook Events Manager (Recommended)

1. **Go to Meta Events Manager**
   - Visit: https://business.facebook.com/events_manager/
   - Select your Pixel ID

2. **Test Events Tab**
   - Click on "Test Events" in the left sidebar
   - This shows real-time events from both Pixel and CAPI

3. **Expected Events:**
   - ✅ **PageView**: Automatic when page loads
   - ✅ **ViewContent**: When viewing product page
   - ✅ **AddToCart**: When adding product to cart
   - ✅ **InitiateCheckout**: When reaching checkout page
   - ✅ **Purchase**: After completing an order

### Method 2: Browser Developer Tools

1. **Open Browser DevTools** (F12)
2. **Console Tab**: Look for Facebook Pixel logs:
   ```
   ✅ Facebook Pixel: ViewContent tracked
   ✅ Facebook Pixel: AddToCart tracked
   ✅ Facebook Pixel: InitiateCheckout tracked
   ✅ Facebook Pixel: Purchase tracked
   ```

3. **Network Tab**: Filter by "facebook" to see pixel requests

### Method 3: Facebook Pixel Helper (Chrome Extension)

1. **Install Extension**: Facebook Pixel Helper from Chrome Web Store
2. **Visit Your Site**: The extension icon will show pixel activity
3. **Green Icon**: Pixel working correctly
4. **Red Icon**: Issues detected

---

## 🔍 Step-by-Step Testing Process

### Step 1: Test Pixel Installation
1. Visit any page on your site
2. Check Events Manager for **PageView** event
3. Verify in browser console: "Facebook Pixel: ViewContent tracked"

### Step 2: Test ViewContent Event
1. Navigate to any product page: `/product/123`
2. Should trigger **ViewContent** event
3. Verify event includes:
   - `content_ids`: Product ID
   - `content_name`: Product name
   - `value`: Product price
   - `currency`: DZD

### Step 3: Test AddToCart Event
1. On product page, select size/color if required
2. Click "Add to Cart" button
3. Should trigger **AddToCart** event
4. Verify event includes:
   - `content_ids`: Product ID
   - `value`: Price × quantity
   - `currency`: DZD
   - `num_items`: Quantity

### Step 4: Test InitiateCheckout Event
1. Navigate to checkout page: `/checkout`
2. Should trigger **InitiateCheckout** event
3. Verify event includes:
   - `content_ids`: Array of product IDs
   - `value`: Total cart value
   - `num_items`: Total quantity

### Step 5: Test Purchase Event (Most Important)
1. Complete a test order (use test data)
2. Should trigger **Purchase** event from:
   - **Frontend**: Order confirmation page
   - **Backend**: Server-side after order processing
3. Verify event includes:
   - `transaction_id`: Order number
   - `value`: Order total
   - `currency`: DZD
   - `content_ids`: Product IDs

---

## 🛠️ Backend Testing

### Test CAPI Connection
```bash
curl -X GET "https://your-backend-url.com/api/facebook/test"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Facebook Conversions API is configured correctly",
  "data": {
    "success": true,
    "events_received": 1,
    "pixel_id": "XXXXXXXXXXXXXXX"
  }
}
```

### Check Backend Logs
Monitor your server logs for:
```
✅ Facebook CAPI: Purchase event sent successfully
📊 Facebook CAPI Purchase results: { success: true, events_received: 1 }
```

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Pixel Not Loading
- **Symptom**: No events in Events Manager
- **Solution**: Check `REACT_APP_FACEBOOK_PIXEL_ID` environment variable
- **Verify**: View page source, search for your Pixel ID

#### 2. Events Not Firing
- **Symptom**: PageView works, but not other events
- **Solution**: Check browser console for JavaScript errors
- **Debug**: Add `console.log` in facebookPixel.js functions

#### 3. CAPI Events Missing
- **Symptom**: Client-side events work, server-side don't
- **Solution**: Verify `FACEBOOK_ACCESS_TOKEN` is correct
- **Test**: Use `/api/facebook/test` endpoint

#### 4. Duplicate Events
- **Symptom**: Events appearing twice in Events Manager
- **Cause**: Both Pixel and CAPI sending same event
- **Solution**: This is expected and improves attribution

#### 5. Wrong Currency
- **Symptom**: Events showing USD instead of DZD
- **Solution**: Verify currency parameter in tracking calls

### Error Messages

#### "Pixel ID not found"
```javascript
// Fix in public/index.html
const PIXEL_ID = 'YOUR_ACTUAL_PIXEL_ID'; // Replace XXXXXXXXXXXXXXX
```

#### "Access Token Invalid"
- Get new token from Events Manager
- Update `FACEBOOK_ACCESS_TOKEN` in backend .env

#### "Events not received"
- Check internet connectivity
- Verify pixel isn't blocked by ad blockers
- Test in incognito mode

---

## 📊 Event Data Verification

### ViewContent Event Data
```javascript
{
  content_type: 'product',
  content_ids: ['123'],
  content_name: 'Kids T-Shirt',
  content_category: 'Clothing',
  value: 2500,
  currency: 'DZD'
}
```

### AddToCart Event Data
```javascript
{
  content_type: 'product',
  content_ids: ['123'],
  value: 5000,
  currency: 'DZD',
  num_items: 2,
  product_size: 'M',
  product_color: 'Red'
}
```

### Purchase Event Data
```javascript
{
  content_type: 'product',
  content_ids: ['123', '456'],
  value: 7500,
  currency: 'DZD',
  num_items: 3,
  transaction_id: 'ORDER_123456',
  delivery_method: 'home_delivery',
  payment_method: 'cash_on_delivery'
}
```

---

## 📈 Performance Verification

### Events Manager Metrics
- **Match Rate**: Should be 70%+ for good attribution
- **Event Count**: Verify numbers match your actual site activity
- **Currency Values**: Check totals are accurate

### Attribution Window
- **1-day view, 7-day click**: Default setting
- **Custom windows**: Can be adjusted in Events Manager

---

## ⚡ Advanced Testing

### Test Environment Setup
1. Use test Pixel ID for development
2. Enable Test Events in Events Manager
3. Use test event code: `TEST12345`

### A/B Testing
1. Test with/without ad blockers
2. Test on different browsers
3. Test mobile vs desktop

### Load Testing
1. Verify events fire under high traffic
2. Check for rate limiting issues
3. Monitor server-side performance

---

## 📱 Mobile Testing

### iOS Safari
- Test with Intelligent Tracking Prevention
- Verify events still fire correctly

### Android Chrome
- Test with ad blockers disabled
- Verify touch events trigger correctly

### Mobile App (if applicable)
- Use Facebook SDK for mobile apps
- Implement App Events alongside web events

---

## 🎯 Success Criteria

✅ **All Events Firing**: ViewContent, AddToCart, InitiateCheckout, Purchase  
✅ **Dual Tracking**: Both Pixel and CAPI sending events  
✅ **Correct Data**: Currency, values, product IDs accurate  
✅ **High Match Rate**: 70%+ in Events Manager  
✅ **No Console Errors**: Clean browser console logs  
✅ **Backend Health**: Test endpoint returns success  

---

## 🔄 Maintenance

### Regular Checks
- **Weekly**: Review Events Manager for unusual patterns
- **Monthly**: Verify match rates and attribution
- **After Updates**: Test events after code deployments

### Pixel Updates
- Facebook occasionally updates pixel code
- Monitor Meta Business Help Center for updates
- Test after any pixel code changes

---

## 📞 Support

### Meta Support
- **Business Support**: Available for verified businesses
- **Developer Documentation**: https://developers.facebook.com/docs/marketing-api/conversions-api
- **Community Forums**: Facebook Business Community

### Internal Debugging
- **Frontend Logs**: Browser console
- **Backend Logs**: Server application logs  
- **Network Monitoring**: Use tools like New Relic or DataDog

---

## 📝 Event Tracking Checklist

### Pre-Launch
- [ ] Pixel ID configured in both frontend and backend
- [ ] Access token configured and tested
- [ ] All event types tested individually
- [ ] Events Manager shows all events
- [ ] Match rates are acceptable
- [ ] Currency and values are correct

### Post-Launch
- [ ] Monitor Events Manager daily for first week
- [ ] Check for any error spikes in logs
- [ ] Verify attribution in Facebook Ads Manager
- [ ] Compare event volume to actual site activity

**Success!** 🎉 Your Facebook Pixel and Conversions API are now properly configured and tested for optimal ad attribution and performance tracking.