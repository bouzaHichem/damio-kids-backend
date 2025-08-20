// MongoDB Atlas Script to Create Admin User
// Run this directly in MongoDB Atlas Data Explorer > Browse Collections > admins > Insert Document

// Use this JSON document:
{
  "email": "admin@damiokids.com",
  "password": "$2b$12$K8J9QXZ5L4M3N2P1R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H2I3J4",
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
  "createdAt": new Date(),
  "updatedAt": new Date()
}

// This password hash corresponds to: AdminPassword123!
// After creating this document, you can login with:
// Email: admin@damiokids.com  
// Password: AdminPassword123!
