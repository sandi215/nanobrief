# NanoBrief — private summaries, on-device first

Paste any text. NanoBrief summarizes it **on-device with Gemini Nano 4** when
available, and falls back to the cloud via **Firebase AI Logic** when it isn't.
The result card always shows which engine answered, so the hybrid routing is
visible, not hidden.

Built for **#BuildHybridAI 2026** (Devpost:
`firebasehybridaihackathon.devpost.com`), Web platform.

## How the hybrid inference works

- One call, one SDK: `getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE })`
  from `firebase/ai`. The SDK runs the prompt on-device (Chrome's Prompt API /
  Gemini Nano 4) when available, otherwise falls back to the cloud Gemini
  model (SDK default: `gemini-3.5-flash-lite` in JS SDK v13+).
- The UI offers three routing modes: **Prefer on-device** (default),
  **Prefer cloud**, and **On-device only**.
- Every response reports its engine via the official
  `result.response.inferenceSource` property (`ON_DEVICE` / `IN_CLOUD`,
  JS SDK v12.5.0+). The result badge shows it, with latency in ms.
- Summaries use **structured output** (JSON schema: `summary` + `keyPoints`)
  on both engines — `inCloudParams.generationConfig` + `onDeviceParams.promptOptions`.
- **All AI inference goes through Firebase AI Logic.** No other model API is
  called anywhere in this repo.
- **App Check is required** and enforced by Firebase AI Logic. Local dev uses
  the debug provider; production uses reCAPTCHA Enterprise.

## Requirements

- Node.js 18+ and npm
- Google Chrome 139+ on desktop, with the flag
  `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` set to
  **Enabled** (needed for on-device inference; without it the app still works
  via the cloud fallback)
- A Firebase project with AI Logic enabled (see `../FIREBASE_SETUP.md` —
  parent/Sandi steps, needs Google login)

## Run locally

```bash
npm install
cp .env.example .env   # then fill in your Firebase web app values
npm run dev            # http://localhost:5173
```

First run, open DevTools console: you will see an **App Check debug token**.
Register it in Firebase console → **App Check → Apps → Manage debug tokens**.
(Keep that token private — never commit it.)

Build for production:

```bash
npm run build          # output in dist/
npm run preview        # preview the production build locally
```

## Deploy (Firebase Hosting, free tier)

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # pick your Firebase project
npm run build
firebase deploy --only hosting
```

## Configuration

All config comes from Vite env vars (`.env`, never committed):

| Variable | What it is |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web API key (public project identifier, not a secret) |
| `VITE_FIREBASE_AUTH_DOMAIN` | e.g. `my-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | e.g. `my-project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID (`1:…:web:…`) |
| `VITE_APPCHECK_SITE_KEY` | reCAPTCHA Enterprise site key (production only; empty = debug provider on localhost) |

Without config the app still loads and shows a "not configured" banner.

## Project structure

```
nanobrief/
├── index.html          # single-page UI
├── public/favicon.svg
├── src/
│   ├── main.js         # UI logic (one feature: summarize)
│   ├── firebase.js     # Firebase init, App Check, hybrid model, summarize()
│   ├── config.js       # env-var config + isConfigured / isLocalhost
│   └── styles.css
├── .env.example        # config template (copy to .env)
├── firebase.json       # Firebase Hosting config
└── vite.config.js
```

## Privacy

- On-device summaries never leave the browser.
- Recent summaries are stored only in the browser's localStorage (max 5).
- No analytics, no tracking, no backend of our own.

## License

MIT — see [LICENSE](LICENSE).
