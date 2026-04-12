/**
 * Auth bridge content script.
 *
 * Runs on jobseek.fyi pages. The web app signals the extension by
 * dispatching a `CustomEvent('mindtheapp:auth-success', { detail: { token } })`
 * on the window after the user signs in with `?extension=true` in the URL.
 * We forward that token to the background service worker.
 *
 * The web app can *also* call `chrome.runtime.sendMessage(EXTENSION_ID, ...)`
 * directly via the externally_connectable manifest key. This bridge exists
 * as a fallback for cases where the web app doesn't know the extension id.
 */

interface AuthSuccessDetail {
  token?: unknown;
}

window.addEventListener("mindtheapp:auth-success", (event) => {
  const detail = (event as CustomEvent<AuthSuccessDetail>).detail;
  const token = detail?.token;
  if (typeof token !== "string" || token.length === 0) return;
  chrome.runtime
    .sendMessage({ type: "AUTH_SUCCESS", token })
    .catch(() => {
      /* ignore */
    });
});
