import { extractJobDescription } from "../lib/jd-extractor";
import type { ExtensionMessage, JobDescriptionPayload } from "../lib/types";

console.debug("[mindtheapp] content script loaded on", location.href);

const BADGE_ID = "mindtheapp-badge";
const DISMISS_STORAGE_KEY = "mindtheapp.badge.dismissed";

/** Shadow-DOM-based badge keeps site CSS from bleeding in. */
interface BadgeHandle {
  host: HTMLElement;
  setJd(jd: JobDescriptionPayload): void;
  hide(): void;
}

let badgeHandle: BadgeHandle | null = null;

function sessionKey(url: string): string {
  // Per-page dismissal — if the user dismisses on job A, the badge
  // still shows on job B.
  return `${DISMISS_STORAGE_KEY}::${url}`;
}

function isDismissed(url: string): boolean {
  try {
    return sessionStorage.getItem(sessionKey(url)) === "1";
  } catch {
    return false;
  }
}

function markDismissed(url: string): void {
  try {
    sessionStorage.setItem(sessionKey(url), "1");
  } catch {
    /* ignore — cookies/storage disabled */
  }
}

function buildBadge(): BadgeHandle {
  const host = document.createElement("div");
  host.id = BADGE_ID;
  Object.assign(host.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483647",
    // Baseline font-size so rem units inside the shadow tree behave.
    fontSize: "14px",
  } satisfies Partial<CSSStyleDeclaration>);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }

    .card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px 10px 12px;
      min-width: 260px;
      max-width: 340px;
      background: rgba(255, 255, 255, 0.96);
      color: #1A1A1A;
      border: 1px solid rgba(26, 26, 26, 0.08);
      border-radius: 14px;
      font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      box-shadow:
        0 10px 24px rgba(15, 23, 42, 0.12),
        0 1px 3px rgba(15, 23, 42, 0.08),
        0 0 0 6px rgba(61, 217, 179, 0.08);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      cursor: pointer;
      transform-origin: bottom right;
      transition: transform 150ms ease, box-shadow 150ms ease, opacity 200ms ease;
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    .card.enter {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .card:hover {
      transform: translateY(-2px) scale(1.01);
      box-shadow:
        0 16px 32px rgba(15, 23, 42, 0.16),
        0 2px 6px rgba(15, 23, 42, 0.1),
        0 0 0 6px rgba(61, 217, 179, 0.12);
    }
    .avatar {
      flex: 0 0 auto;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #3DD9B3 0%, #2FB896 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #0B2A24;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
    }
    .body {
      flex: 1 1 auto;
      min-width: 0;
    }
    .eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #2FB896;
      line-height: 1;
      margin-bottom: 3px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .eyebrow .dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: #3DD9B3;
      box-shadow: 0 0 0 3px rgba(61, 217, 179, 0.25);
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 3px rgba(61, 217, 179, 0.25); }
      50%      { box-shadow: 0 0 0 5px rgba(61, 217, 179, 0.08); }
    }
    .title {
      font-size: 13px;
      font-weight: 600;
      color: #1A1A1A;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .subtitle {
      font-size: 11px;
      color: #6B6B6B;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }
    .dismiss {
      flex: 0 0 auto;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: #6B6B6B;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background 120ms ease, color 120ms ease;
    }
    .dismiss:hover {
      background: rgba(26, 26, 26, 0.06);
      color: #1A1A1A;
    }
    .dismiss svg { display: block; }
  `;
  shadow.appendChild(style);

  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", "Open Mind the App side panel");

  card.innerHTML = `
    <div class="avatar" aria-hidden="true">M</div>
    <div class="body">
      <div class="eyebrow"><span class="dot" aria-hidden="true"></span><span class="eyebrow-text">Ready to analyze</span></div>
      <div class="title" data-role="title">Mind the App</div>
      <div class="subtitle" data-role="subtitle">Click to open side panel</div>
    </div>
    <button class="dismiss" type="button" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M5 5 l10 10 M15 5 l-10 10"/>
      </svg>
    </button>
  `;
  shadow.appendChild(card);

  // Slide-in entry.
  requestAnimationFrame(() => card.classList.add("enter"));

  const dismissBtn = card.querySelector<HTMLButtonElement>(".dismiss");
  dismissBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    markDismissed(location.href);
    host.remove();
    badgeHandle = null;
  });

  const openPanel = (e?: Event) => {
    if (e && e.target instanceof Element && e.target.closest(".dismiss")) {
      return;
    }
    const msg: ExtensionMessage = { type: "OPEN_SIDE_PANEL" };
    chrome.runtime.sendMessage(msg).catch(() => {
      /* background may be waking up */
    });
  };
  card.addEventListener("click", openPanel);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPanel();
    }
  });

  return {
    host,
    setJd(jd: JobDescriptionPayload) {
      const titleEl = card.querySelector<HTMLDivElement>('[data-role="title"]');
      const subtitleEl =
        card.querySelector<HTMLDivElement>('[data-role="subtitle"]');
      if (titleEl) titleEl.textContent = jd.jobTitle || "Untitled role";
      if (subtitleEl) {
        subtitleEl.textContent = jd.company
          ? `${jd.company} · Click to analyze`
          : "Click to analyze";
      }
    },
    hide() {
      host.remove();
    },
  };
}

function ensureBadge(jd: JobDescriptionPayload): void {
  if (isDismissed(location.href)) return;
  if (!badgeHandle) {
    badgeHandle = buildBadge();
    document.documentElement.appendChild(badgeHandle.host);
  }
  badgeHandle.setJd(jd);
}

function removeBadge(): void {
  badgeHandle?.hide();
  badgeHandle = null;
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
  ensureBadge(payload);
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
