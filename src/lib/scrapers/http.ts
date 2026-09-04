/**
 * Polite HTTP fetch for scrapers: identifies itself honestly, throttles
 * requests, and retries with exponential backoff (spec section 34).
 */

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ??
  "GoldDealFinderBot/0.1 (personal project, non-commercial; contact via GitHub repo)";

export async function politeFetchText(url: string, delayMs = 1500, retries = 2): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      await sleep(delayMs); // throttle between requests, success or failure
      return text;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(delayMs * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
