// NanoBrief UI logic — vanilla JS, no framework.
// One feature: paste text -> structured summary via Firebase AI Logic.

import { isConfigured } from "./config.js";
import {
  checkNanoAvailability,
  getAppCheckStatus,
  summarize,
} from "./firebase.js";

const $ = (id) => document.getElementById(id);

const SAMPLE_TEXT = `The city of Bandung announced a new electric bus network on Tuesday, covering 12 routes across the metropolitan area. The first phase, with 60 buses, starts operating in January and will connect the central train station with three university campuses and the main hospital. Fares are set at 5,000 rupiah per trip, with free rides for students and seniors during the first three months. City officials say the network should cut private car trips in the city center by an estimated 18 percent within the first year. A second phase, adding 40 more buses and 8 routes, is planned for mid-2027, pending a budget review. Local transport groups welcomed the plan but asked for clearer schedules and better stops near residential areas.`;

const state = {
  busy: false,
  length: "medium",
  modeKey: "preferOnDevice",
  history: [],
};

try {
  state.history = JSON.parse(localStorage.getItem("nanobrief-history") || "[]");
} catch {
  state.history = [];
}

function saveHistory(item) {
  state.history = [item, ...state.history].slice(0, 5);
  try {
    localStorage.setItem("nanobrief-history", JSON.stringify(state.history));
  } catch {
    /* storage unavailable — history is a nice-to-have */
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function setStatus(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.className = "status " + kind;
}

function renderHistory() {
  const box = $("history");
  box.innerHTML = "";
  if (!state.history.length) {
    box.appendChild(el("p", "muted", "No summaries yet — your last 5 stay on this device only."));
    return;
  }
  for (const h of state.history) {
    const card = el("div", "history-item");
    const head = el("div", "history-head");
    head.appendChild(el("span", "badge " + (h.source === "ON_DEVICE" ? "on-device" : "in-cloud"),
      h.source === "ON_DEVICE" ? "On-device" : "Cloud"));
    head.appendChild(el("span", "muted small", `${h.ms} ms · ${h.chars} chars · ${h.when}`));
    card.appendChild(head);
    card.appendChild(el("p", "", h.summary));
    card.appendChild(el("button", "link-btn", "Load text"));
    card.querySelector("button").addEventListener("click", () => {
      $("input").value = h.text;
      $("input").focus();
      updateCounts();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    box.appendChild(card);
  }
}

function updateCounts() {
  const n = $("input").value.length;
  $("count").textContent = `${n.toLocaleString()} characters · ~${Math.max(1, Math.round(n / 5))} words`;
  $("summarizeBtn").disabled = state.busy || n < 50;
  $("hint").textContent =
    n === 0 ? "Paste an article, meeting notes, or any long text."
    : n < 50 ? "A little more text, please (at least 50 characters)."
    : "Ready. Summaries run on-device first when Gemini Nano is available.";
}

function showResult(data, text) {
  const box = $("result");
  box.hidden = false;
  box.innerHTML = "";

  const head = el("div", "result-head");
  const badge = el("span", "badge " + (data.source === "ON_DEVICE" ? "on-device" : "in-cloud"),
    data.source === "ON_DEVICE" ? "ON-DEVICE · Gemini Nano 4" : "CLOUD · Gemini fallback");
  head.appendChild(badge);
  head.appendChild(el("span", "muted small",
    `${data.ms} ms · ${data.source === "ON_DEVICE" ? "private · free · no data left your device" : "cloud fallback used"}`));
  box.appendChild(head);

  box.appendChild(el("h2", "", "Summary"));
  box.appendChild(el("p", "summary-text", data.summary));

  if (data.keyPoints.length) {
    box.appendChild(el("h2", "", "Key points"));
    const ul = el("ul", "points");
    for (const p of data.keyPoints) ul.appendChild(el("li", "", p));
    box.appendChild(ul);
  }

  const actions = el("div", "actions");
  const copyBtn = el("button", "btn secondary", "Copy summary");
  copyBtn.addEventListener("click", async () => {
    const full = data.summary + "\n\nKey points:\n" + data.keyPoints.map((p) => "• " + p).join("\n");
    try {
      await navigator.clipboard.writeText(full);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy summary"), 1500);
    } catch {
      copyBtn.textContent = "Copy failed — select the text manually";
    }
  });
  actions.appendChild(copyBtn);
  box.appendChild(actions);

  saveHistory({
    summary: data.summary,
    source: data.source,
    ms: data.ms,
    chars: text.length,
    text,
    when: new Date().toLocaleString(),
  });
  renderHistory();
}

async function onSummarize() {
  const text = $("input").value.trim();
  if (text.length < 50 || state.busy) return;
  state.busy = true;
  updateCounts();
  $("result").hidden = true;
  $("progressWrap").hidden = false;
  $("progressBar").style.width = "0%";
  $("progressLabel").textContent = "Starting Gemini Nano…";
  setStatus("Summarizing…", "busy");

  try {
    const data = await summarize(text, {
      length: state.length,
      modeKey: state.modeKey,
      onProgress: (val) => {
        $("progressBar").style.width = `${Math.round(val * 100)}%`;
        $("progressLabel").textContent = `Downloading on-device model: ${Math.round(val * 100)}%`;
      },
    });
    $("progressWrap").hidden = true;
    showResult(data, text);
    setStatus(
      data.source === "ON_DEVICE"
        ? "Done — answered on-device by Gemini Nano 4. Nothing was sent to the cloud."
        : "Done — on-device model was not available, so the cloud fallback answered.",
      "ok"
    );
  } catch (err) {
    $("progressWrap").hidden = true;
    console.error(err);
    setStatus(`Could not summarize: ${err?.message || err}`, "error");
  } finally {
    state.busy = false;
    updateCounts();
  }
}

async function initNanoStatus() {
  const pill = $("nanoPill");
  const avail = await checkNanoAvailability();
  const labels = {
    available: ["Gemini Nano: available on this device", "ok"],
    downloading: ["Gemini Nano: downloading…", "busy"],
    downloadable: ["Gemini Nano: ready to download (first run)", "busy"],
    unavailable: ["Gemini Nano: not available — cloud fallback will be used", "warn"],
    unsupported: ["Gemini Nano: not supported in this browser (use Chrome 139+ on desktop)", "warn"],
    unknown: ["Gemini Nano: status unknown", "warn"],
  };
  const [label, kind] = labels[avail] || labels.unknown;
  pill.textContent = label;
  pill.className = "pill " + kind;
}

function init() {
  // Config banner
  if (!isConfigured) {
    $("configBanner").hidden = false;
  }
  $("appcheckNote").textContent = `App Check: ${getAppCheckStatus()}`;

  // Length pills
  document.querySelectorAll("[data-length]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.length = btn.dataset.length;
      document.querySelectorAll("[data-length]").forEach((b) =>
        b.classList.toggle("active", b === btn));
    });
  });

  // Routing select
  $("modeSelect").addEventListener("change", (e) => {
    state.modeKey = e.target.value;
  });

  $("sampleBtn").addEventListener("click", () => {
    $("input").value = SAMPLE_TEXT;
    updateCounts();
    $("input").focus();
  });
  $("clearBtn").addEventListener("click", () => {
    $("input").value = "";
    $("result").hidden = true;
    updateCounts();
    $("input").focus();
  });
  $("input").addEventListener("input", updateCounts);
  $("summarizeBtn").addEventListener("click", onSummarize);

  updateCounts();
  renderHistory();
  initNanoStatus();
}

init();
