// Generate VAPID keys for Web Push
// Usage: node scripts/generateVapidKeys.js

const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('\n=== VAPID KEYS (Web Push) ===');
console.log('WEBPUSH_VAPID_PUBLIC_KEY=', keys.publicKey);
console.log('WEBPUSH_VAPID_PRIVATE_KEY=', keys.privateKey);
console.log('\nAdd these to your backend environment and set REACT_APP_WEBPUSH_VAPID_PUBLIC_KEY in the admin frontend.');
