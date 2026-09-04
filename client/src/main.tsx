import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { captureReferralCode } from './lib/referral';
import './styles/index.css';

// Runs before the first render so `?ref=CODE` is banked and stripped from the
// URL no matter which screen the invite link lands on.
captureReferralCode();

if ('serviceWorker' in navigator) {
  // In development, unregister any previously installed Service Workers so
  // they cannot intercept and re-serve stale HMR bundles for localhost or
  // the Network URL.  This eliminates cross-origin cache divergence.
  if (!import.meta.env.PROD) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister().catch(() => {
          // Silently ignore — dev environment cleanup.
        });
      });
    });
    // Also clear Cache Storage entries that the dev SW may have populated.
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => {
          caches.delete(key).catch(() => {
            // Silently ignore.
          });
        });
      });
    }
  } else {
    // Production: register the Service Worker for PWA support.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failure is non-critical — PWA features simply won't be available.
      });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
