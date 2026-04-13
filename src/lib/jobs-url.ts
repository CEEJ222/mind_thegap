import { createHash } from "crypto";

/**
 * Canonicalize a job-posting URL and derive a stable ID used in the
 * global `jobs` table for extension-sourced postings.
 *
 * Canonicalization: drop tracking query params (utm_*, ref, source) so
 * the same posting hashes the same regardless of referrer. Resulting ID
 * is prefixed with `ext:` to keep these rows distinct from LinkedIn
 * scraped jobs (which use LinkedIn's numeric id as the primary key).
 */
export function extensionJobId(url: string): string {
  let canonical = url;
  try {
    const u = new URL(url);
    const stripped = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (/^utm_|^ref$|^source$/i.test(k)) return;
      stripped.set(k, v);
    });
    const qs = stripped.toString();
    canonical = `${u.origin}${u.pathname}${qs ? `?${qs}` : ""}`;
  } catch {
    /* fall back to raw url */
  }
  const hash = createHash("sha256")
    .update(canonical)
    .digest("base64url")
    .slice(0, 24);
  return `ext:${hash}`;
}
