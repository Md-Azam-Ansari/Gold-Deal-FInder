/**
 * robots.txt compliance (spec section 34). Checked at runtime, every scrape —
 * not just eyeballed once — so the scraper stays honest even if a site's
 * rules change later.
 *
 * This is a minimal parser: it only reads the "User-agent: *" group and does
 * literal-prefix matching (no wildcard `*`/`$` support within Disallow rules).
 * That covers the vast majority of real robots.txt files. If a target site
 * relies on wildcard Disallow patterns, upgrade to a proper parser
 * (e.g. the `robots-parser` package) before trusting this for that site.
 */

export async function isScrapingAllowed(baseUrl: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/robots.txt`);
    if (res.status === 404) return true; // no robots.txt = no restrictions, per the standard
    if (!res.ok) {
      console.warn(`robots.txt returned ${res.status} for ${baseUrl} — refusing to scrape as a precaution`);
      return false;
    }
    const text = await res.text();
    return isPathAllowed(text, path);
  } catch (err) {
    console.warn(`Could not fetch robots.txt for ${baseUrl} — refusing to scrape as a precaution:`, err);
    return false;
  }
}

export function isPathAllowed(robotsTxt: string, path: string): boolean {
  const disallowed = getWildcardDisallowRules(robotsTxt);
  return !disallowed.some((rule) => rule && path.startsWith(rule));
}

function getWildcardDisallowRules(robotsTxt: string): string[] {
  const lines = robotsTxt
    .split("\n")
    .map((l) => l.split("#")[0].trim())
    .filter(Boolean);

  const disallowed: string[] = [];
  let currentGroupAgents: string[] = [];
  let groupIsOpen = false; // true while consecutive User-agent lines are still being collected

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (key === "user-agent") {
      if (!groupIsOpen) currentGroupAgents = [];
      currentGroupAgents.push(value);
      groupIsOpen = true;
      continue;
    }

    if (key === "disallow" || key === "allow") {
      groupIsOpen = false; // any directive closes the current User-agent group
      if (key === "disallow" && value && currentGroupAgents.includes("*")) {
        disallowed.push(value);
      }
    }
  }

  return disallowed;
}
