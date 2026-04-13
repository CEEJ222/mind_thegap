import { clearToken, storeToken } from "../lib/auth";
import { markApplied, ApiError } from "../lib/api";
import type {
  AppliedDetectionPayload,
  ExtensionMessage,
  GetAuthStateResponse,
  GetCurrentJdResponse,
  JobDescriptionPayload,
} from "../lib/types";
import { isAuthenticated } from "../lib/auth";

const AUTH_URL = "https://www.jobseek.fyi/auth/login?extension=true";

/**
 * In-memory cache of the most recently detected JD, keyed by tabId. The
 * side panel reads from this when it opens so the UI can hydrate without
 * waiting for another detection round-trip.
 */
const latestJdByTab = new Map<number, JobDescriptionPayload>();
/** Track which tab opened the auth flow so we can close it after success. */
let authTabId: number | null = null;

chrome.runtime.onInstalled.addListener(() => {
  // Allow clicking the toolbar icon to open the side panel.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[mindtheapp] setPanelBehavior", err));
});

async function openSidePanelForActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  // Keep the side panel persistent as the user navigates between tabs.
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "sidepanel/index.html",
    enabled: true,
  });
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    console.error("[mindtheapp] sidePanel.open failed", err);
  }
}

async function handleOpenAuth(): Promise<void> {
  const tab = await chrome.tabs.create({ url: AUTH_URL });
  authTabId = tab.id ?? null;
}

async function handleAuthSuccess(token: string): Promise<void> {
  await storeToken(token);
  if (authTabId !== null) {
    try {
      await chrome.tabs.remove(authTabId);
    } catch {
      /* tab may already be closed */
    }
    authTabId = null;
  }
  // Notify any open side panel to re-render.
  chrome.runtime
    .sendMessage({ type: "AUTH_STATE_CHANGED" })
    .catch(() => {
      /* no listener — fine */
    });
}

function handleJdDetected(
  payload: JobDescriptionPayload,
  tabId: number | undefined,
): void {
  if (typeof tabId === "number") {
    latestJdByTab.set(tabId, payload);
  }
  chrome.runtime
    .sendMessage({ type: "JD_UPDATED", payload })
    .catch(() => {
      /* side panel may not be open yet */
    });
}

/** De-dupe mark-applied calls across reloads within the same SW lifetime. */
const appliedInFlight = new Set<string>();

async function handleAppliedDetected(
  payload: AppliedDetectionPayload,
): Promise<void> {
  if (appliedInFlight.has(payload.jobUrl)) return;
  appliedInFlight.add(payload.jobUrl);
  try {
    const resp = await markApplied({
      url: payload.jobUrl,
      title: payload.title,
      company: payload.company,
      atsType: payload.atsType,
    });
    chrome.runtime
      .sendMessage({
        type: "JOB_STATUS_UPDATED",
        jobUrl: payload.jobUrl,
        status: resp.status,
        previousStatus: resp.previous_status,
      })
      .catch(() => {
        /* side panel may not be open */
      });
  } catch (err) {
    // 401 etc — just log; content script will retry on next navigation.
    if (err instanceof ApiError) {
      console.warn(
        "[mindtheapp] mark-applied failed:",
        err.status,
        err.message,
      );
    } else {
      console.error("[mindtheapp] mark-applied error:", err);
    }
    appliedInFlight.delete(payload.jobUrl);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  latestJdByTab.delete(tabId);
});

// Clear cached JD when a tab navigates away — the content script will
// repopulate it if the new page is a supported ATS.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" && changeInfo.url) {
    latestJdByTab.delete(tabId);
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage | { type: "GET_CURRENT_JD" },
    sender,
    sendResponse,
  ) => {
    const msg = message as ExtensionMessage;

    switch (msg.type) {
      case "OPEN_AUTH":
        void handleOpenAuth();
        sendResponse({ ok: true });
        return false;

      case "AUTH_SUCCESS":
        void handleAuthSuccess(msg.token);
        sendResponse({ ok: true });
        return false;

      case "OPEN_SIDE_PANEL":
        void openSidePanelForActiveTab();
        sendResponse({ ok: true });
        return false;

      case "JD_DETECTED":
        handleJdDetected(msg.payload, sender.tab?.id);
        sendResponse({ ok: true });
        return false;

      case "APPLIED_DETECTED":
        void handleAppliedDetected(msg.payload);
        sendResponse({ ok: true });
        return false;

      case "GET_CURRENT_JD": {
        (async () => {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          const jd =
            tab?.id != null ? latestJdByTab.get(tab.id) ?? null : null;
          const resp: GetCurrentJdResponse = { jd };
          sendResponse(resp);
        })();
        return true; // async response
      }

      case "GET_AUTH_STATE": {
        (async () => {
          const authenticated = await isAuthenticated();
          const resp: GetAuthStateResponse = { authenticated };
          sendResponse(resp);
        })();
        return true;
      }

      case "SIGN_OUT":
        void clearToken().then(() => sendResponse({ ok: true }));
        return true;

      default:
        return false;
    }
  },
);

// Also accept external messages from jobseek.fyi web pages so they can
// post the session token back to the extension after sign-in.
chrome.runtime.onMessageExternal.addListener(
  (message, _sender, sendResponse) => {
    if (
      message &&
      typeof message === "object" &&
      message.type === "AUTH_SUCCESS" &&
      typeof message.token === "string"
    ) {
      void handleAuthSuccess(message.token);
      sendResponse({ ok: true });
      return false;
    }
    sendResponse({ ok: false });
    return false;
  },
);
