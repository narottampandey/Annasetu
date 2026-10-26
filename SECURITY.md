# 🔒 Security Documentation - Annasetu

## Environment Variables

**All sensitive credentials are stored in `.env` file (NOT committed to git)**

### Required Environment Variables:
```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key_min_32_chars
NODE_ENV=development
PORT=5000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
```

### Setup Instructions:
1. Copy `.env.example` to `.env`
2. Fill in your actual credentials
3. **Never commit `.env` to git** ✓ Already in .gitignore

---

## Security Features Implemented

### ✅ Authentication & Authorization
- JWT tokens signed with strong secret key
- Token expiration: 7 days
- Google OAuth 2.0 integration
- Password hashing with bcryptjs (10 salt rounds)
- User isolation: Users can only see their own donations

### ✅ Data Protection
- MongoDB ObjectId for user references
- UserId validation on all donation operations
- Ownership checks before deletion/update
- SQL injection prevention via Mongoose ODM

### ✅ Code Security
- No credentials hardcoded in source files
- All secrets loaded from environment variables
- Sensitive debug endpoints available only in development mode
- Error messages don't leak sensitive data

### ✅ API Security
- CORS configured for trusted origins
- JSON payload size limited to prevent attacks
- Authorization headers validated on all protected routes
- Input validation and sanitization on all endpoints

---

## Development vs Production

### Development Mode
```bash
NODE_ENV=development npm run dev
```
- Debug endpoints enabled: `/api/donations/debug/*`
- Verbose logging enabled
- Full error stack traces in responses

### Production Mode (Recommended for Deployment)
```bash
NODE_ENV=production npm start
```
- Debug endpoints disabled
- Access tokens should use HTTPS only
- All secrets must be production-grade
- Enable CORS only for your frontend domain

---

## Credentials Never in Code

### ✓ Correct (Using .env):
```javascript
const mongoUri = process.env.MONGO_URI;
const jwtSecret = process.env.JWT_SECRET;
```

### ✗ WRONG (Don't do this):
```javascript
const mongoUri = "mongodb+srv://user:pass@cluster.mongodb.net/db"; // EXPOSED!
const jwtSecret = "hardcoded_secret"; // EXPOSED!
```

---

## Security Best Practices

1. **Rotate Secrets Regularly**
   - Change JWT_SECRET annually
   - Regenerate Google OAuth credentials if compromised

2. **Use HTTPS in Production**
   - All API calls should be over HTTPS
   - Secure cookies with `secure: true`

3. **Monitor Access Logs**
   - Review debug endpoints in development
   - Monitor authentication failures
   - Track deletion operations

4. **Database Backups**
   - Regular MongoDB backups
   - Test restoration procedures
   - Keep backups secure

5. **Dependency Updates**
   - Regularly update npm packages
   - Review security advisories: `npm audit`
   - Use `npm update` to patch vulnerabilities

---

## File Permissions

| File | Should Be | Currently |
|------|-----------|-----------|
| `.env` | Secret ✓ | In .gitignore ✓ |
| `package.json` | Public | Committed ✓ |
| Source code | Public | Committed ✓ |
| Credentials | Secret | Not in repo ✓ |

---

## Deployment Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Update `.env` with production credentials
- [ ] Use production MongoDB Atlas connection
- [ ] Generate strong JWT_SECRET (32+ characters)
- [ ] Update Google OAuth redirect URI
- [ ] Enable HTTPS
- [ ] Review CORS origins (don't use "*")
- [ ] Disable debug endpoints
- [ ] Test authentication flow
- [ ] Verify donations are user-isolated
- [ ] Monitor error logs for 24 hours
- [ ] Set up automated backups

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT open a public GitHub issue**
2. Contact: [security contact email]
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

---

## Key Takeaway

**Credentials are secure because:**
- ✅ `.env` is in `.gitignore` (not committed)
- ✅ All sensitive data uses environment variables
- ✅ Source code never contains secrets
- ✅ JWT tokens are properly signed and verified
- ✅ User data is isolated by userId
- ✅ Debug endpoints are development-only

Stay safe! 🔐
