// Shared CORS origin resolution for both the HTTP server and Socket.IO.
// In production, origins are restricted to ALLOWED_ORIGINS (comma-separated).
// In development, a fixed set of local origins is allowed, plus any network IP on common ports.
// Requests without an Origin header (server-to-server, curl, mobile) are allowed.

function getAllowedOrigins() {
  if (process.env.NODE_ENV === 'production') {
    return (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  const baseOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
  ];

  // Allow any network IP on ports 3000 or 5000 in development
  // This enables testing from mobile devices or other machines on the local network
  const devAllowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  return [...baseOrigins, ...devAllowedOrigins];
}

function isOriginAllowed(origin) {
  // No origin (non-browser / server-to-server requests) is permitted.
  if (!origin) return true;

  // In development, allow any localhost variant
  if (process.env.NODE_ENV !== 'production') {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return true;
    }
    // Allow any http://192.168.x.x or http://10.x.x.x or http://172.x.x.x on ports 3000/5000
    if (/^https?:\/\/\d+\.\d+\.\d+\.\d+:/i.test(origin)) {
      const portMatch = origin.match(/:(\d+)$/);
      if (portMatch && (portMatch[1] === '3000' || portMatch[1] === '3001' || portMatch[1] === '5000')) {
        return true;
      }
    }
  }

  return getAllowedOrigins().includes(origin);
}

module.exports = { getAllowedOrigins, isOriginAllowed };
