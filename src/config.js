// Firebase web configuration, read from Vite env vars (see .env.example).
// All values are empty until the Firebase project is set up — the app shows a
// clear "not configured" banner in that state instead of crashing.
// NOTE: a Firebase web apiKey is a public project identifier, not a secret.
// Security comes from App Check + API restrictions in the Firebase console.
// NEVER commit an App Check debug token anywhere.

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

// Optional: reCAPTCHA Enterprise site key for App Check in production.
// Empty = local development uses the App Check debug provider instead.
export const appCheckSiteKey =
  import.meta.env.VITE_APPCHECK_SITE_KEY || "";

export const isConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

export const isLocalhost =
  typeof location !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(location.hostname);
