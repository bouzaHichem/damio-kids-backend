# Damio Kids Backend

Express.js backend API for the Damio Kids e-commerce platform.

## Features

- RESTful API for products, users, orders
- JWT authentication
- Image upload with Cloudinary
- MongoDB database
- CORS configuration
- Rate limiting and security middleware

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `MONGODB_URI`: MongoDB Atlas connection string
- `JWT_SECRET`: Secure random string (min 32 characters)
- `CLOUDINARY_*`: Cloudinary credentials for image uploads
- `FRONTEND_URL`: Your frontend domain for CORS
- `ADMIN_URL`: Your admin panel domain for CORS

## Local Development

```bash
npm install
npm run dev
```

## Deployment on Render

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add all environment variables in Render dashboard
6. Deploy!

The API will be available at your Render service URL.

## API Endpoints

- `GET /api/products` - Get all products
- `POST /api/products` - Create product (admin)
- `POST /api/users/signup` - User registration
- `POST /api/users/login` - User login
- `POST /api/upload` - Image upload
- And many more...

## Security Features

- Helmet for security headers
- Rate limiting on authentication endpoints
- CORS configured for production domains
- Input validation and sanitization
