# Admin Settings API Documentation

## Overview

The Admin Settings API provides comprehensive functionality for admin profile management, including personal information updates, password changes, and profile icon management with Cloudinary integration.

## Authentication

All admin settings endpoints require authentication via the `requireAdminAuth` middleware. Include the admin JWT token in one of the following ways:

- **Authorization Header**: `Authorization: Bearer <admin_token>`
- **HTTP-Only Cookie**: `adminToken=<admin_token>` (automatically handled)

## Endpoints

### 1. GET /api/admin/settings

Get the current admin's profile information.

**Request:**
```http
GET /api/admin/settings
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "admin_id",
    "email": "admin@damiokids.com",
    "firstName": "John",
    "lastName": "Doe",
    "profileIcon": "https://res.cloudinary.com/your-cloud/image/upload/admin-profiles/admin_123_1638360000000.jpg",
    "role": "super_admin",
    "permissions": ["manage_products", "manage_orders", ...],
    "isActive": true,
    "lastLogin": "2024-01-15T10:30:00.000Z",
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. PUT /api/admin/settings

Update admin profile information, including password changes and profile icon URL.

**Request:**
```http
PUT /api/admin/settings
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "firstName": "John",
  "lastName": "Doe", 
  "email": "john.doe@damiokids.com",
  "profileIconUrl": "https://res.cloudinary.com/your-cloud/image/upload/admin-profiles/new_icon.jpg",
  "currentPassword": "currentPassword123",
  "newPassword": "newPassword456",
  "confirmPassword": "newPassword456"
}
```

**Request Fields:**
- `firstName` (required): Admin's first name
- `lastName` (required): Admin's last name  
- `email` (required): Admin's email address (must be unique)
- `profileIconUrl` (optional): URL to profile icon image (Cloudinary or external URL)
- `currentPassword` (required if changing password): Current password for verification
- `newPassword` (optional): New password (minimum 6 characters)
- `confirmPassword` (required if newPassword provided): Password confirmation

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "_id": "admin_id",
    "email": "john.doe@damiokids.com",
    "firstName": "John",
    "lastName": "Doe",
    "profileIcon": "https://res.cloudinary.com/your-cloud/image/upload/admin-profiles/new_icon.jpg",
    "role": "super_admin",
    "permissions": ["manage_products", "manage_orders", ...],
    "isActive": true,
    "lastLogin": "2024-01-15T10:30:00.000Z",
    "createdAt": "2023-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**Validation Errors:**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "firstName": "First name is required",
    "email": "Please enter a valid email address",
    "currentPassword": "Current password is incorrect",
    "newPassword": "New password must be at least 6 characters long",
    "confirmPassword": "Password confirmation does not match"
  }
}
```

### 3. POST /api/admin/settings/upload-avatar

Upload a new profile icon image to Cloudinary.

**Request:**
```http
POST /api/admin/settings/upload-avatar
Content-Type: multipart/form-data
Authorization: Bearer <admin_token>

Form Data:
- profileIcon: [Image File] (jpg, jpeg, png, gif, webp - max 5MB)
```

**Response:**
```json
{
  "success": true,
  "message": "Profile icon uploaded successfully",
  "data": {
    "profileIcon": "https://res.cloudinary.com/your-cloud/image/upload/v1642256400/admin-profiles/admin_123_1642256400000.jpg"
  }
}
```

**Image Processing:**
- Automatically resized to 200x200 pixels with face-focused cropping
- Optimized quality for web delivery
- Previous profile icon automatically deleted from Cloudinary
- Unique filename generation to prevent conflicts

### 4. DELETE /api/admin/settings/avatar

Remove the current admin's profile icon.

**Request:**
```http
DELETE /api/admin/settings/avatar
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Profile icon removed successfully"
}
```

## Error Responses

### Authentication Errors
```json
{
  "success": false,
  "message": "Admin authentication required",
  "code": "AUTH_REQUIRED"
}
```

### Validation Errors
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": {
    "field_name": "Error message for this field"
  }
}
```

### File Upload Errors
```json
{
  "success": false,
  "message": "Only image files are allowed"
}
```

```json
{
  "success": false,
  "message": "File size too large. Maximum size is 5MB"
}
```

### Server Errors
```json
{
  "success": false,
  "message": "Server error"
}
```

## Admin Model Schema

The `Admin` model includes the following fields related to settings:

```javascript
{
  email: String (required, unique, validated),
  password: String (required, hashed, min 6 chars),
  firstName: String (required, max 50 chars),
  lastName: String (required, max 50 chars),
  profileIcon: String (optional, URL validated),
  role: String (enum: ['admin', 'super_admin', 'moderator']),
  isActive: Boolean (default: true),
  permissions: [String] (array of permission strings),
  lastLogin: Date,
  loginAttempts: Number (for security),
  lockUntil: Date (for account locking),
  createdAt: Date,
  updatedAt: Date
}
```

## Profile Icon Validation

The `profileIcon` field accepts:
- Cloudinary URLs (https://res.cloudinary.com/...)
- External image URLs (https://example.com/image.jpg)
- Supported formats: JPG, JPEG, PNG, GIF, WEBP
- Maximum file size: 5MB for uploads
- Automatic validation of URL format

## Security Features

1. **Password Security:**
   - Current password verification required for changes
   - Password hashing with bcrypt (cost factor 12)
   - Minimum 6 character requirement
   - Password confirmation validation

2. **Account Protection:**
   - Email uniqueness validation
   - Active admin status checking
   - JWT token verification
   - Rate limiting on uploads

3. **File Upload Security:**
   - File type validation (images only)
   - File size limits (5MB max)
   - Cloudinary integration for secure storage
   - Automatic cleanup of old images

## Environment Variables

Required environment variables for full functionality:

```env
# Cloudinary Configuration (required for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# JWT Configuration
JWT_SECRET=your_jwt_secret

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/damio-kids
```

## Usage Examples

### Frontend Integration (React/Next.js)

```javascript
// Get admin profile
const getAdminProfile = async () => {
  const response = await fetch('/api/admin/settings', {
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  return response.json();
};

// Update profile
const updateProfile = async (profileData) => {
  const response = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify(profileData)
  });
  return response.json();
};

// Upload profile icon
const uploadProfileIcon = async (file) => {
  const formData = new FormData();
  formData.append('profileIcon', file);
  
  const response = await fetch('/api/admin/settings/upload-avatar', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    },
    body: formData
  });
  return response.json();
};
```

### Password Change Flow

```javascript
const changePassword = async (currentPassword, newPassword) => {
  const profileData = {
    // Include current profile data
    firstName: admin.firstName,
    lastName: admin.lastName,
    email: admin.email,
    // Password change fields
    currentPassword,
    newPassword,
    confirmPassword: newPassword
  };
  
  return updateProfile(profileData);
};
```

This API provides a comprehensive solution for admin profile management with secure file uploads, robust validation, and proper error handling.
