# Food Loss Mitigation Platform - Setup Guide

## 🎯 What's Been Implemented

Your frontend and backend are now fully integrated with authentication and database connectivity. Here's what was set up:

### ✅ Backend (Node.js + Express)
- **server.js**: Updated with CORS support and static file serving
- **authcontrollers.js**: Complete register and login logic with JWT tokens
- **authroutes.js**: API endpoints for `/register` and `/login`
- **User Model**: MongoDB schema with password hashing via bcryptjs
- **Database Config**: MongoDB connection setup

### ✅ Frontend (HTML + JavaScript)
- **register.html**: Form to create new accounts
- **login.html**: Form to authenticate users
- **dashboard.html**: Protected page for logged-in users
- **register.js**: Client-side validation and API integration
- **login.js**: Authentication and token storage
- **dashboard.js**: Session protection and user display

### ✅ Authentication Flow
1. **Register**: User provides name, email, phone, password → Saved to DB with bcryptjs hashing
2. **Login**: User enters email/password → Verified against DB → JWT token created → Stored in localStorage
3. **Dashboard**: Protected by token check → Shows user greeting → Provides logout

---

## 🚀 Getting Started

### Prerequisites
- Node.js installed
- MongoDB running locally or cloud URI ready
- npm packages installed

### Step 1: Install Dependencies
```bash
cd d:\MANUAL PROGRAMMING\FULL STACK\project\annasetu
npm install
```

### Step 2: Configure Environment Variables
The `.env` file is already created. Update it with your values:

```env
MONGO_URI=mongodb://localhost:27017/annasetu
JWT_SECRET=your_jwt_secret_key_change_this_in_production
PORT=5000

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
```

### Step 2a: Setup Google OAuth (Optional)

#### Get Google OAuth Credentials:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API**
4. Go to **Credentials** → **Create OAuth 2.0 Client ID**
   - Choose **Web Application**
   - Add **Authorized JavaScript origins**:
     - `http://localhost:5000`
     - `http://localhost:3000`
   - Add **Authorized redirect URIs**:
     - `http://localhost:5000/api/auth/google/callback`
5. Copy the **Client ID** and **Client Secret**

#### Update .env:
Replace the placeholders with your actual Google credentials:
```env
GOOGLE_CLIENT_ID=your_client_id_from_google_console.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_from_google_console
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
```

#### Update login.html (Optional - for Google Sign-In Widget):
If you want to use Google's official sign-in widget, update the `data-client_id` in login.html:
```html
<div id="g_id_onload"
     data-client_id="YOUR_GOOGLE_CLIENT_ID"
     data-callback="handleCredentialResponse">
</div>
```

**For MongoDB**:
- **Local**: `mongodb://localhost:27017/annasetu`
- **Cloud (MongoDB Atlas)**: `mongodb+srv://username:password@cluster.mongodb.net/annasetu`

### Step 3: Start the Backend Server
```bash
cd annasetu_servers
node server.js
```

You should see:
```
MongoDB connected successfully
Server running on port 5000
```

### Step 4: Access the Application
Open your browser and navigate to:
```
http://localhost:5000
```

---

## 📝 User Flow

### 1. Registration
- Visit **http://localhost:5000/register.html**
- Fill in: Name, Email, Phone, Password
- Submit → Account created → Redirects to **login.html**

### 2. Login
- Visit **http://localhost:5000/login.html**
- Enter Email and Password
- Submit → Token saved to localStorage → Redirects to **dashboard.html**

### 3. Dashboard
- Shows personalized welcome message with user's name
- Displays available functions (Add Food, Browse, etc.)
- Click **Logout** → Clears token → Redirects to login

---

## 🔐 Technical Details

### Authentication
- **Password**: Hashed using bcryptjs (10 salt rounds)
- **JWT Token**: Valid for 7 days
- **Storage**: Token stored in `localStorage` as `token`
- **User Info**: Stored in `localStorage` as `user` (JSON)

### API Endpoints

#### Register User
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "password": "password123"
}

Response:
{
  "message": "User registered successfully"
}
```

#### Login User
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

---

## 🛠️ Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running: `mongod`
- Check `MONGO_URI` in `.env` file
- Verify network access (for MongoDB Atlas)

### CORS Error
- Server has CORS enabled for `http://localhost:3000`
- To add more origins, update server.js:
```javascript
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:8000"],
  credentials: true
}));
```

### Token Expiration
- After 7 days, tokens expire automatically
- User must login again
- Change expiration in authcontrollers.js: `{ expiresIn: "30d" }`

### Users Not Showing in Dashboard
- Clear browser cache/localStorage
- Check if token exists: Open DevTools → Application → localStorage
- Verify database connection

---

## 📦 Project Structure
```
annasetu/
├── annasetu_clients/          # Frontend
│   ├── index.html
│   ├── register.html
│   ├── login.html
│   ├── dashboard.html
│   ├── css/
│   │   ├── register.css
│   │   ├── login.css
│   │   ├── dashboard.css
│   │   └── style.css
│   └── js/
│       ├── register.js        # NEW
│       ├── login.js           # NEW
│       └── dashboard.js       # NEW
├── annasetu_servers/          # Backend
│   ├── server.js              # UPDATED
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   └── authcontrollers.js
│   ├── models/
│   │   └── user.js
│   ├── routes/
│   │   └── authroutes.js
│   └── middleware/
├── .env                       # NEW
├── .gitignore
├── package.json
└── README.md
```

---

## 🚢 Deployment

Before deploying to production:

1. **Update JWT_SECRET**:
   ```env
   JWT_SECRET=generate_a_strong_random_key_here
   ```

2. **Use MongoDB Atlas** instead of local MongoDB

3. **Set NODE_ENV**:
   ```env
   NODE_ENV=production
   ```

4. **Update CORS origins** for your domain

5. **Use environment-specific files**:
   - `.env.production`
   - `.env.development`

---

## ✨ Next Steps

After verification, you can enhance the system by:

1. **Add Food Listing**: Create `/api/food/create` endpoint to store food listings
2. **Food Image Upload**: Integrate multer for image uploads
3. **Profile Management**: Add `/api/user/profile` endpoint
4. **Request Management**: Create system for food requests and approvals
5. **Password Reset**: Implement email-based password recovery
6. **Admin Dashboard**: Add admin controls for moderation

---

## ❓ Questions?

For issues or features, check:
- Console errors (F12 → Console)
- Network requests (F12 → Network)
- Server logs (terminal)
- Browser localStorage (F12 → Application)

Happy coding! 🚀
