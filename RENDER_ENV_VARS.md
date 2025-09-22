# 🚀 Render Environment Variables for Firebase Push Notifications

Add these environment variables to your Render service:

## Required Firebase Variables

### FIREBASE_SERVICE_ACCOUNT_KEY
**Value:** Copy the ENTIRE contents of your downloaded Firebase service account JSON file as a single line string.

Example format (replace with your actual values):
```
{"type":"service_account","project_id":"damio-kids-admin-demo","private_key_id":"abc123...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvgIB...your_key_here...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xyz@damio-kids-admin-demo.iam.gserviceaccount.com","client_id":"123456789...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/v1/metadata/x509/firebase-adminsdk-xyz%40damio-kids-admin-demo.iam.gserviceaccount.com"}
```

### FIREBASE_PROJECT_ID
**Value:** `damio-kids-admin-demo`

## How to Add to Render:

1. Go to your Render dashboard
2. Select your backend service
3. Go to "Environment" tab
4. Click "Add Environment Variable"
5. Add each variable:
   - Key: `FIREBASE_SERVICE_ACCOUNT_KEY`
   - Value: [paste your entire JSON service account key as one line]
   
   - Key: `FIREBASE_PROJECT_ID` 
   - Value: `damio-kids-admin-demo`

6. Click "Save Changes"
7. Your service will automatically redeploy

## Testing the Setup

After deployment, you can test the push notification service by visiting:
- `https://your-backend-url.onrender.com/api/admin/fcm/status` (requires admin auth)

## Frontend Configuration

Make sure your admin frontend has this environment variable on Vercel:
- `REACT_APP_BACKEND_URL=https://your-backend-url.onrender.com`

This ensures the FCM tokens are sent to the correct backend endpoint.