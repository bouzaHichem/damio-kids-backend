const bcrypt = require('bcryptjs');

// Generate a proper bcrypt hash for the admin password
const password = 'AdminPassword123!';
const saltRounds = 12;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
  } else {
    console.log('Password:', password);
    console.log('Hash:', hash);
    console.log('\nUse this MongoDB document to replace the existing admin:');
    console.log(JSON.stringify({
      "email": "admin@damiokids.com",
      "password": hash,
      "firstName": "Admin",
      "lastName": "User",
      "profileIcon": null,
      "role": "super_admin",
      "isActive": true,
      "permissions": [
        "manage_products",
        "manage_orders",
        "manage_users", 
        "manage_categories",
        "manage_collections",
        "manage_emails",
        "view_analytics",
        "manage_settings"
      ],
      "loginAttempts": 0,
      "lockUntil": null,
      "lastLogin": null,
      "createdAt": {"$date": "2024-08-20T16:55:00.000Z"},
      "updatedAt": {"$date": "2024-08-20T16:55:00.000Z"}
    }, null, 2));
  }
});
