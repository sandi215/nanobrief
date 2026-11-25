// Firebase AI Logic (hybrid inference) setup for NanoBrief.
// Docs: https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
//
// ALL AI inference in this app goes through Firebase AI Logic — no other
// model API is called anywhere in the codebase.

import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
} from "firebase/ai";
import { appCheckSiteKey, firebaseConfig, isConfigured, isLocalhost } from "./config.js";

// ---------------------------------------------------------------------------
// App Check (required for Firebase AI Logic; debug tokens are accepted)
// ---------------------------------------------------------------------------
let appCheckStatus = "not-configured";

function initAppCheck(app) {
  try {
    if (isLocalhost) {
      // Local development: use the App Check debug provider.
      // Must be set BEFORE initializeAppCheck. On first run the console logs
      // a debug token — register it in Firebase console > App Check > Apps >
      // Manage debug tokens. Never commit that token.
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    if (appCheckSiteKey) {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckStatus = "recaptcha-enterprise";
    } else if (isLocalhost) {
      // No production site key yet: initialize App Check so the debug
      // provider (enabled above) is used. The placeholder key is never
      // contacted while the debug provider is active.
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider("debug-placeholder"),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckStatus = "debug-provider";
    } else {
      appCheckStatus = "missing-site-key";
    }
  } catch (err) {
    console.warn("[NanoBrief] App Check init failed:", err);
    appCheckStatus = "error";
  }
}

// ---------------------------------------------------------------------------
// Firebase + AI Logic
// ---------------------------------------------------------------------------
let app = null;
let ai = null;
let model = null;
let modelInitState = "idle"; // idle | downloading | ready | error

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  initAppCheck(app);
  ai = getAI(app, { backend: new GoogleAIBackend() });
} else {
  appCheckStatus = "not-configured";
}

// Structured output schema: every summary comes back as predictable JSON.
// Supported for BOTH on-device and cloud inference (docs: hybrid structured
// output uses inCloudParams.generationConfig + onDeviceParams.promptOptions).
const briefSchema = Schema.object({
  properties: {
    summary: Schema.string({
      description: "The summary of the pasted text, in the requested length.",
    }),
    keyPoints: Schema.array({
      items: Schema.string({
        description: "One key point from the text, as a short sentence.",
      }),
    }),
  },
});

const MODES = {
  preferOnDevice: InferenceMode.PREFER_ON_DEVICE,
  preferInCloud: InferenceMode.PREFER_IN_CLOUD,
  onlyOnDevice: InferenceMode.ONLY_ON_DEVICE,
};

/** Create (or recreate) the hybrid model for the chosen routing mode. */
export function getModel(modeKey = "preferOnDevice") {
  if (!ai) throw new Error("Firebase is not configured yet.");
  const mode = MODES[modeKey] || InferenceMode.PREFER_ON_DEVICE;
  model = getGenerativeModel(ai, {
    mode,
    inCloudParams: {
      // Cloud fallback model is the SDK default (gemini-3.5-flash-lite in
      // JS SDK v13+). Override here only if a different model is needed.
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: briefSchema,
      },
    },
    onDeviceParams: {
      promptOptions: { responseConstraint: briefSchema },
    },
  });
  // New model instance: (re-)run initializeDeviceModel before first use.
  // Cheap when the Nano model is already downloaded.
  modelInitState = "idle";
  return model;
}

/**
 * Must be called after a user gesture (button click) and before the first
 * generateContent() call. Starts the Gemini Nano download if needed and
 * reports progress (0..1) via onProgress.
 */
export async function ensureDeviceModel(onProgress) {
  if (!model) throw new Error("Model is not created yet.");
  if (modelInitState === "ready") return;
  modelInitState = "downloading";
  try {
    await model.initializeDeviceModel((val) => {
      if (typeof onProgress === "function") onProgress(val);
    });
    modelInitState = "ready";
  } catch (err) {
    // initializeDeviceModel can throw when no on-device model is available
    // (e.g. non-Chrome browser). With PREFER_ON_DEVICE the SDK still falls
    // back to the cloud, so we only record the state and continue.
    console.warn("[NanoBrief] initializeDeviceModel:", err?.message || err);
    modelInitState = "error";
  }
}

/** Check Chrome's on-device model availability (Prompt API). */
export async function checkNanoAvailability() {
  try {
    if (typeof window === "undefined" || !window.LanguageModel?.availability) {
      return "unsupported";
    }
    return await window.LanguageModel.availability();
  } catch {
    return "unknown";
  }
}

/** Run one summarization. Returns { summary, keyPoints, source, ms }. */
export async function summarize(text, { length = "medium", modeKey = "preferOnDevice", onProgress } = {}) {
  const m = getModel(modeKey);
  await ensureDeviceModel(onProgress);

  const lengthGuide = {
    short: "in 2-3 short sentences, plus 3 key points",
    medium: "in one concise paragraph, plus 3-5 key points",
    detailed: "in two thorough paragraphs, plus 5 key points",
  }[length] || "in one concise paragraph, plus 3-5 key points";

  const prompt =
    `Summarize the following text ${lengthGuide}. ` +
    `Keep the summary faithful to the original; do not add facts that are not in the text. ` +
    `Return only JSON matching the schema.\n\nTEXT:\n${text}`;

  const started = performance.now();
  const result = await m.generateContent(prompt);
  const ms = Math.round(performance.now() - started);

  // inferenceSource is the official way to know which engine answered.
  // Available in JS SDK v12.5.0+. NOTE: the runtime values are lowercase
  // snake_case ("on_device" / "in_cloud") — the docs name the enum members
  // ON_DEVICE / IN_CLOUD. We normalize to the uppercase form for the UI.
  const rawSource = result.response.inferenceSource || "";
  const source =
    rawSource === "on_device" || rawSource === "ON_DEVICE"
      ? "ON_DEVICE"
      : rawSource === "in_cloud" || rawSource === "IN_CLOUD"
        ? "IN_CLOUD"
        : "UNKNOWN";

  let parsed;
  try {
    parsed = JSON.parse(result.response.text());
  } catch {
    // Fallback: structured output should guarantee JSON, but never crash
    // the UI if the model returns plain text.
    parsed = { summary: result.response.text(), keyPoints: [] };
  }

  return {
    summary: parsed.summary || "",
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    source,
    ms,
  };
}

export function getAppCheckStatus() {
  return appCheckStatus;
}

export function getModelInitState() {
  return modelInitState;
}
