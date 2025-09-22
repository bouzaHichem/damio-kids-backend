const webpush = require('web-push');
const AdminPushSubscription = require('../models/AdminPushSubscription');

const PUBLIC_KEY = process.env.WEBPUSH_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.WEBPUSH_VAPID_PRIVATE_KEY;
const CONTACT = process.env.WEBPUSH_CONTACT_EMAIL || 'mailto:admin@damio-kids.local';

let configured = false;

function configure() {
  if (configured) return;
  if (PUBLIC_KEY && PRIVATE_KEY) {
    webpush.setVapidDetails(CONTACT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
    console.log('✅ Web Push configured (VAPID)');
  } else {
    console.warn('🟡 Web Push not configured: missing VAPID keys');
  }
}

async function subscribe(adminId, subscription, meta = {}) {
  configure();
  if (!subscription || !subscription.endpoint) {
    throw new Error('Invalid subscription');
  }

  const doc = await AdminPushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      adminId: String(adminId || 'unknown'),
      endpoint: subscription.endpoint,
      keys: subscription.keys || {},
      deviceType: meta.deviceType || 'web',
      userAgent: meta.userAgent || '',
      lastUsedAt: new Date(),
      active: true
    },
    { upsert: true, new: true }
  );

  return { success: true, id: doc._id };
}

async function listSubscriptions(adminId) {
  const q = adminId ? { adminId: String(adminId), active: true } : { active: true };
  const subs = await AdminPushSubscription.find(q).lean();
  return subs;
}

async function sendToSubscription(sub, payload) {
  configure();
  if (!configured) throw new Error('Web Push not configured');
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return { success: true };
  } catch (e) {
    if (e.statusCode === 410 || e.statusCode === 404) {
      await AdminPushSubscription.deleteOne({ endpoint: sub.endpoint });
      console.log('🗑️ Removed expired web push subscription');
    }
    return { success: false, error: e.message };
  }
}

async function sendOrderNotification(order, adminId = null) {
  const subs = await listSubscriptions(adminId);
  if (!subs.length) return { success: false, total: 0 };

  const payload = {
    title: '🚨 New Order Alert!',
    body: `Order #${order.orderNumber} - ${Number(order.total).toLocaleString('en-DZ')} DZD`,
    icon: '/icon-192x192.png',
    data: { url: `/orders/${order._id}` }
  };

  const results = await Promise.allSettled(subs.map(s => sendToSubscription(s, payload)));
  const success = results.filter(r => r.value?.success).length;
  return { success: success > 0, total: subs.length, successful: success };
}

async function sendTest(adminId = null) {
  const subs = await listSubscriptions(adminId);
  if (!subs.length) return { success: false, total: 0 };
  const payload = { title: '🧪 Test', body: 'Web Push test notification', icon: '/icon-192x192.png' };
  const results = await Promise.allSettled(subs.map(s => sendToSubscription(s, payload)));
  const success = results.filter(r => r.value?.success).length;
  return { success: success > 0, total: subs.length, successful: success };
}

function getStatus() {
  return {
    configured,
    hasPublicKey: !!process.env.WEBPUSH_VAPID_PUBLIC_KEY,
    hasPrivateKey: !!process.env.WEBPUSH_VAPID_PRIVATE_KEY,
    contact: CONTACT
  };
}

module.exports = { configure, subscribe, listSubscriptions, sendOrderNotification, sendTest, getStatus };
