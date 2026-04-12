/**
 * Helpers for the jobseek.fyi ↔ Mind the App Chrome extension auth bridge.
 *
 * When the extension opens the auth page, it appends `?extension=true` to
 * the URL. After a successful Supabase sign-in the web app calls
 * {@link sendTokenToExtension} with the fresh access token; the extension's
 * background service worker stores it via `chrome.storage.local` and closes
 * this tab.
 *
 * The extension must declare `externally_connectable.matches` including
 * `https://jobseek.fyi/*` (see `mindtheapp-extension/manifest.json`) for
 * `chrome.runtime.sendMessage(extensionId, ...)` to reach it from this
 * origin.
 */

interface ChromeRuntimeLike {
  sendMessage: (
    extensionId: string,
    message: unknown,
    responseCallback?: (response: unknown) => void,
  ) => void;
  lastError?: { message?: string };
}

interface ChromeGlobal {
  runtime?: ChromeRuntimeLike;
}

const EXTENSION_QUERY_PARAM = "extension";

/** True when the current URL has `?extension=true` (or `?extension=1`). */
export function isExtensionAuthFlow(): boolean {
  if (typeof window === "undefined") return false;
  const value = new URLSearchParams(window.location.search).get(
    EXTENSION_QUERY_PARAM,
  );
  return value === "true" || value === "1";
}

/** Preserve the `extension` query param across internal auth-page links. */
export function withExtensionParam(href: string): string {
  if (!isExtensionAuthFlow()) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${EXTENSION_QUERY_PARAM}=true`;
}

/**
 * Forward a Supabase access token to the Mind the App extension.
 *
 * Returns true on best-effort success. Returns false (and logs a warning)
 * when the extension is not installed, the env var is missing, or the
 * browser does not expose `chrome.runtime`. Never throws.
 */
export function sendTokenToExtension(token: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  const extensionId = process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID;
  if (!extensionId) {
    console.warn(
      "[extension-auth] NEXT_PUBLIC_CHROME_EXTENSION_ID is not set; " +
        "cannot forward session to Mind the App extension.",
    );
    return Promise.resolve(false);
  }

  const chromeGlobal = (window as unknown as { chrome?: ChromeGlobal }).chrome;
  if (!chromeGlobal?.runtime?.sendMessage) {
    console.warn(
      "[extension-auth] chrome.runtime is not available on this page.",
    );
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    try {
      chromeGlobal.runtime!.sendMessage(
        extensionId,
        { type: "AUTH_SUCCESS", token },
        () => {
          const err = chromeGlobal.runtime?.lastError;
          if (err?.message) {
            console.warn(
              "[extension-auth] extension responded with error",
              err.message,
            );
            resolve(false);
            return;
          }
          resolve(true);
        },
      );
    } catch (err) {
      console.warn("[extension-auth] failed to send message", err);
      resolve(false);
    }
  });
}
