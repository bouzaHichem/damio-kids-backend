# Frontend Configuration Guide for CORS & Auth Issues

## API Configuration Updates Needed

### 1. Environment Variables for Frontend (.env files)

**damio-kids-frontend/.env.production:**
`
REACT_APP_API_URL=https://damio-kids-backend.onrender.com
REACT_APP_ENV=production
`

**damio-kids-admin/.env.production:**
`
REACT_APP_API_URL=https://damio-kids-backend.onrender.com
REACT_APP_ENV=production
`

### 2. API Service Configuration

Create or update your API service file (usually src/services/api.js or similar):

`javascript
// api.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

// Configure axios if you're using it
import axios from 'axios';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken') || localStorage.getItem('auth-token');
    if (token) {
      // Use Authorization header (recommended)
      config.headers.Authorization = Bearer ;
      // Also include auth-token header for backward compatibility
      config.headers['auth-token'] = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('authToken');
      localStorage.removeItem('auth-token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
`

### 3. Authentication Service Updates

Update your auth service to handle tokens correctly:

`javascript
// authService.js
import api from './api';

class AuthService {
  async login(credentials) {
    try {
      const response = await api.post('/login', credentials);
      
      if (response.data.success && response.data.token) {
        // Store token in localStorage
        localStorage.setItem('authToken', response.data.token);
        // For backward compatibility
        localStorage.setItem('auth-token', response.data.token);
        return response.data;
      }
      
      throw new Error(response.data.errors || 'Login failed');
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      throw error;
    }
  }

  async signup(userData) {
    try {
      const response = await api.post('/signup', userData);
      
      if (response.data.success && response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('auth-token', response.data.token);
        return response.data;
      }
      
      throw new Error(response.data.errors || 'Signup failed');
    } catch (error) {
      console.error('Signup error:', error.response?.data || error.message);
      throw error;
    }
  }

  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  getToken() {
    return localStorage.getItem('authToken');
  }

  isAuthenticated() {
    const token = this.getToken();
    if (!token) return false;
    
    try {
      // Basic token validation (check if it's not expired)
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp > Date.now() / 1000;
    } catch {
      return false;
    }
  }
}

export default new AuthService();
`

### 4. Fetch API Alternative (if not using axios)

If you're using fetch directly:

`javascript
// apiHelper.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('authToken');
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 
        'Authorization': Bearer ,
        'auth-token': token 
      }),
    },
    credentials: 'include',
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: { ...defaultOptions.headers, ...options.headers },
  };

  try {
    const response = await fetch(${API_BASE_URL}, mergedOptions);
    
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('auth-token');
        window.location.href = '/login';
        return;
      }
      throw new Error(HTTP error! status: );
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Usage examples:
export const login = (credentials) => 
  apiRequest('/login', { method: 'POST', body: JSON.stringify(credentials) });

export const getProducts = () => 
  apiRequest('/allproducts');

export const addProduct = (productData) => 
  apiRequest('/addproduct', { method: 'POST', body: JSON.stringify(productData) });
`

### 5. CORS & Credentials in Component Level

For any manual fetch calls in components:

`javascript
// In your React components
useEffect(() => {
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('https://damio-kids-backend.onrender.com/allproducts', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': Bearer ,
          'auth-token': token,
        },
        credentials: 'include', // Important for CORS
      });

      if (!response.ok) {
        throw new Error(HTTP error! status: );
      }

      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  fetchData();
}, []);
`

### 6. Vercel Configuration

Create ercel.json in your frontend projects if you don't have it:

**Frontend vercel.json:**
`json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
`

**Admin vercel.json:**
`json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        }
      ]
    }
  ]
}
`

## Deployment Checklist

### Before Deploying:
1. ? Update API service configuration
2. ? Set environment variables in Vercel dashboard
3. ? Update authentication service
4. ? Test token storage and retrieval
5. ? Add error handling for API calls

### After Deploying:
1. ? Test login/signup from both apps
2. ? Check browser network tab for CORS errors
3. ? Verify tokens are being sent correctly
4. ? Test authenticated routes (admin panel)
5. ? Monitor backend logs on Render

## Debugging Tips

### Browser Developer Tools:
1. **Network Tab**: Check if requests include proper headers
2. **Console**: Look for CORS or authentication errors
3. **Application Tab**: Verify tokens are stored correctly
4. **Sources**: Add breakpoints in API calls

### Common Issues & Solutions:

**Issue**: CORS preflight errors
**Solution**: Ensure credentials: 'include' is set and backend allows your origin

**Issue**: 401 Unauthorized despite having token  
**Solution**: Check token format and ensure it's being sent in headers

**Issue**: Token is undefined or null
**Solution**: Verify token storage after login and retrieval before API calls

**Issue**: Network failed errors
**Solution**: Check if backend URL is correct and service is running
