import { extractJobDescription } from "../lib/jd-extractor";
import type { ExtensionMessage, JobDescriptionPayload } from "../lib/types";

const BADGE_ID = "mindtheapp-badge";

function injectBadge(): void {
  if (document.getElementById(BADGE_ID)) return;

  const badge = document.createElement("button");
  badge.id = BADGE_ID;
  badge.type = "button";
  badge.textContent = "Analyze with Mind the App ↗";
  Object.assign(badge.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483647",
    padding: "10px 16px",
    background: "#3DD9B3",
    color: "#0B2A24",
    border: "none",
    borderRadius: "999px",
    fontFamily: '"DM Sans", system-ui, sans-serif',
    fontSize: "14px",
    fontWeight: "600",
    boxShadow: "0 6px 20px rgba(61, 217, 179, 0.35)",
    cursor: "pointer",
    lineHeight: "1",
  } satisfies Partial<CSSStyleDeclaration>);

  badge.addEventListener("click", () => {
    const msg: ExtensionMessage = { type: "OPEN_SIDE_PANEL" };
    chrome.runtime.sendMessage(msg).catch(() => {
      /* background may be waking up */
    });
  });

  document.documentElement.appendChild(badge);
}

function removeBadge(): void {
  document.getElementById(BADGE_ID)?.remove();
}

function sendJd(payload: JobDescriptionPayload): void {
  const msg: ExtensionMessage = { type: "JD_DETECTED", payload };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* service worker may be asleep — it'll pick up on next interaction */
  });
}

let lastSignature = "";

function detectAndReport(): void {
  const payload = extractJobDescription();
  if (!payload) {
    removeBadge();
    lastSignature = "";
    return;
  }

  // Skip noisy re-fires when the DOM mutates but the JD is unchanged.
  const signature = `${payload.pageUrl}::${payload.jdText.length}::${payload.jobTitle}`;
  if (signature === lastSignature) return;
  lastSignature = signature;

  sendJd(payload);
  injectBadge();
}

// Run once on load and observe subsequent DOM/URL changes — SPAs like
// LinkedIn and Ashby never trigger a full navigation.
detectAndReport();

const observer = new MutationObserver(() => {
  // Debounce by scheduling at end of microtask queue.
  window.clearTimeout((window as unknown as { __mtaT?: number }).__mtaT);
  (window as unknown as { __mtaT?: number }).__mtaT = window.setTimeout(
    detectAndReport,
    400,
  );
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// Catch SPA history navigations.
let lastUrl = location.href;
window.setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    lastSignature = "";
    detectAndReport();
  }
}, 1000);
