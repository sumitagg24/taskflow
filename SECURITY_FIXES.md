# Security Fixes Applied

## ✅ Fixed in Code (vercel.json)

### 1. Clickjacking Protection (Medium)
**Files:** `vercel.json`, `client/vercel.json`
- Added `X-Frame-Options: DENY`
- Added CSP `frame-ancestors 'none'`

### 2. Missing CSP Header (Low)
**Files:** `vercel.json`, `client/vercel.json`
- Comprehensive CSP policy with:
  - `default-src 'self'`
  - `script-src` with Google Auth0 allowed
  - `frame-ancestors 'none'` (clickjacking)
  - `object-src 'none'`
  - `upgrade-insecure-requests`

### 3. Missing X-XSS-Protection Header (Low)
**Files:** `vercel.json`, `client/vercel.json`
- Added `X-XSS-Protection: 1; mode=block`

### 4. Security Headers Already Present
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`

---

## ⚙️ Requires Environment Variable Changes

### 5. CORS Wildcard on Vercel Frontend (Medium)
**Issue:** `Access-Control-Allow-Origin: *` on Vercel responses
**Fix:** Vercel doesn't allow restricting CORS for static hosting via vercel.json.
**Workaround:** The API server already restricts CORS properly in `server/config/cors.js` (production fails closed when `ALLOWED_ORIGINS` unset).

### 6. Email Disclosure (Info)
**Issue:** Personal Gmail `sumitaggw2004@gmail.com` exposed
**Fix:** Set `SUPPORT_EMAIL` environment variable on the **server** (Railway/Vercel API):
```bash
SUPPORT_EMAIL=support@yourdomain.com
```
The email is ONLY used server-side in `server/services/emailService.js:316` and never exposed to the browser.

### 7. Backend URL Hardcoded in Bundle (Info)
**Issue:** `https://task-tracker-production-f051.up.railway.app` in production JS
**Fix:** Update Vercel **client project** environment variable:
```bash
VITE_API_URL=https://your-new-api-domain.com/api
VITE_SOCKET_URL=https://your-new-api-domain.com
```
Rebuild and redeploy the client after changing.

### 8. Auth0 Domain & Google OAuth Client ID (Info)
**Status:** Expected behavior for OAuth flows - these are public by design.

---

## 📋 Deployment Checklist

### Vercel (Frontend Project)
1. Set environment variables:
   - `VITE_API_URL` = Your API URL (e.g., `https://api.yourdomain.com/api`)
   - `VITE_SOCKET_URL` = Your API origin (e.g., `https://api.yourdomain.com`)
   - `VITE_AUTH0_DOMAIN` = Your Auth0 domain
   - `VITE_AUTH0_CLIENT_ID` = Your Auth0 SPA client ID

2. Verify headers are applied after deploy:
   ```bash
   curl -I https://your-frontend.vercel.app
   ```

### Server (API Host - Railway/Oracle/Vercel)
1. Set environment variables:
   - `MONGO_URI` = MongoDB Atlas connection string
   - `JWT_SECRET` = 64-char hex (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `JWT_REFRESH_SECRET` = Different 64-char hex
   - `AI_KEY_SECRET` = 64-char hex (for encrypting user AI keys)
   - `CLIENT_URL` = Your frontend URL (e.g., `https://your-frontend.vercel.app`)
   - `ALLOWED_ORIGINS` = Same as CLIENT_URL (comma-separated for extras)
   - `SUPPORT_EMAIL` = Professional support email (e.g., `support@yourdomain.com`)
   - `EMAIL_FROM` = Verified sender for Resend/SMTP
   - `RESEND_API_KEY` = Resend API key (preferred over SMTP)
   - `GOOGLE_CLIENT_ID` = Google OAuth client ID
   - `AUTH0_DOMAIN` = Auth0 tenant domain
   - `AUTH0_CLIENT_ID` = Auth0 SPA client ID
   - `TRUST_PROXY` = `true` (if behind reverse proxy like Railway)
   - `REDIS_URL` = Redis URL for distributed rate limiting (optional)

2. Verify CORS works:
   ```bash
   curl -H "Origin: https://your-frontend.vercel.app" -I https://your-api.com/api/health
   ```

---

## 🔍 Verification Commands

After deploying, verify fixes:

```bash
# Check security headers
curl -I https://your-frontend.vercel.app

# Check CSP
curl -I https://your-frontend.vercel.app | grep -i content-security-policy

# Check CORS on API
curl -H "Origin: https://evil.com" -I https://your-api.com/api/health

# Should NOT have Access-Control-Allow-Origin: *
# Should have your frontend origin or be blocked
```

---

## 📝 Notes

- The `sha256-GV3MzgrEm/WOEDkhHKYcrl36TKzqNh3EhZo4thC6H7k=` in CSP is for inline scripts. Regenerate after major build changes:
  ```bash
  # Get hash from browser console error after deploying
  ```

- The CSP allows `https://accounts.google.com` and `https://*.auth0.com` for OAuth popups.

- `frame-ancestors 'none'` in CSP + `X-Frame-Options: DENY` provides defense in depth against clickjacking.

- The backend service (Railway) being down is an infrastructure issue, not a code fix.