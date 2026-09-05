/**
 * IMDb has no API for changing a person's credits; changes go through
 * its Contribution system, which anyone with an IMDb account can use
 * and IMDb reviews. What IMDb does document is a contribution URL that
 * opens a person's form with a number of stunt-credit slots ready:
 * an nm… person id plus "stunts.add.N". So the app cannot push a
 * credit, but it can hand a performer (or an admin on their behalf) a
 * link that opens the right form with the right number of slots, and
 * the list of shows and characters to type into it — which is what
 * /admin/imdb does.
 *
 * Pre-filling title ids and roles through the URL is not documented;
 * matching the app's show names to IMDb title ids is a separate
 * feature. Until then each show carries an IMDb title search link.
 */

/** The most slots IMDb's form documents opening at once. */
export const IMDB_MAX_SLOTS = 40;

/** "nm1234567" from whatever was typed or pasted — an id, or a profile URL. */
export function normalizeImdbId(raw: string | null | undefined): string | null {
  const m = /nm\d{5,9}/i.exec(raw ?? "");
  return m ? m[0].toLowerCase() : null;
}

/** "tt1234567" from whatever was typed or pasted — an id, or a title URL. */
export function normalizeImdbTitleId(raw: string | null | undefined): string | null {
  const m = /tt\d{5,9}/i.exec(raw ?? "");
  return m ? m[0].toLowerCase() : null;
}

/** The title's IMDb page. */
export function imdbTitleUrl(tt: string): string {
  return `https://www.imdb.com/title/${tt}/`;
}

/** One hit from IMDb's suggestion service, for a title or a name. */
export interface ImdbSuggestion {
  id: string;
  label: string;
  /** "TV series · 2003–", or a person's known-for line. */
  detail: string;
  imageUrl: string | null;
  url: string;
}

/**
 * IMDb's suggestion endpoint — the one its own search box uses, not a
 * documented API: /suggestion/{titles|names}/{first letter}/{query}.json.
 * The proxy route fetches it; this is the URL, kept here so it is one
 * line to fix if IMDb moves it.
 */
export function imdbSuggestionUrl(type: "title" | "name", query: string): string {
  const q = query.trim().toLowerCase().replace(/\s+/g, "_");
  const letter = /^[a-z]/.test(q) ? q[0] : "x";
  return `https://v3.sg.media-imdb.com/suggestion/${type === "title" ? "titles" : "names"}/${letter}/${encodeURIComponent(q)}.json`;
}

/**
 * The suggestion payload, reduced to what the pages show. Titles carry
 * a kind (q) and a year or span; names carry a known-for line (s).
 * Anything without an id of the right shape is dropped.
 */
export function parseImdbSuggestions(payload: unknown, type: "title" | "name"): ImdbSuggestion[] {
  const d = (payload as { d?: unknown[] } | null)?.d;
  if (!Array.isArray(d)) return [];
  const out: ImdbSuggestion[] = [];
  for (const raw of d) {
    const r = raw as { id?: string; l?: string; q?: string; y?: number; yr?: string; s?: string; i?: { imageUrl?: string } };
    const id = type === "title" ? normalizeImdbTitleId(r.id) : normalizeImdbId(r.id);
    if (!id || !r.l) continue;
    const detail =
      type === "title"
        ? [r.q, r.yr || (r.y ? String(r.y) : "")].filter(Boolean).join(" · ")
        : r.s ?? "";
    out.push({
      id,
      label: r.l,
      detail,
      imageUrl: r.i?.imageUrl ?? null,
      url: type === "title" ? imdbTitleUrl(id) : imdbPersonUrl(id),
    });
  }
  return out;
}

/** The person's IMDb page. */
export function imdbPersonUrl(nm: string): string {
  return `https://www.imdb.com/name/${nm}/`;
}

/**
 * The contribution form for adding stunt credits, opened with `slots`
 * empty rows. The `update=` query form is the one IMDb's help pages
 * describe; if IMDb changes it, this is the one line to fix.
 */
export function imdbAddStuntsUrl(nm: string, slots: number): string {
  const n = Math.max(1, Math.min(IMDB_MAX_SLOTS, Math.round(slots)));
  return `https://contribute.imdb.com/updates?update=${nm}:stunts.add.${n}`;
}

/** IMDb's own search, narrowed to titles, for a show name. */
export function imdbTitleSearchUrl(showName: string): string {
  return `https://www.imdb.com/find/?q=${encodeURIComponent(showName.trim())}&s=tt`;
}

/** IMDb's search narrowed to people, for a performer with no id yet. */
export function imdbPersonSearchUrl(name: string): string {
  return `https://www.imdb.com/find/?q=${encodeURIComponent(name.trim())}&s=nm`;
}

/** A day as the tracker holds it, the parts a credit is built from. */
export interface CreditDay {
  showName: string;
  workDate: string;
  characterName?: string | null;
  actorDoubled?: string | null;
  workType?: string | null;
}

/** One show as it would be credited: every character, every actor doubled. */
export interface ShowCredit {
  showName: string;
  firstDate: string;
  lastDate: string;
  days: number;
  characters: string[];
  actorsDoubled: string[];
  /** "Stunt Double (for Adam Sandler)" — the line IMDb's form wants. */
  creditLine: string;
}

const clean = (v: string | null | undefined) => (v ?? "").trim();

/**
 * The shows a performer's days add up to, most recent first, each
 * with the characters and doubled actors across its days — one row
 * per show, because IMDb credits the show, not the day. Other-work
 * days (commercials, non-union) are left out: they are not IMDb
 * credits in the same sense and would need their own decision.
 */
export function showCredits(days: CreditDay[]): ShowCredit[] {
  const byShow = new Map<string, CreditDay[]>();
  for (const day of days) {
    if (day.workType === "other") continue;
    const name = clean(day.showName);
    if (!name || /^untranscribed exhibit g/i.test(name)) continue;
    const key = name.toLowerCase();
    byShow.set(key, [...(byShow.get(key) ?? []), day]);
  }
  const credits: ShowCredit[] = [];
  for (const rows of byShow.values()) {
    const dates = rows.map((r) => (r.workDate || "").slice(0, 10)).filter(Boolean).sort();
    const characters = [...new Set(rows.map((r) => clean(r.characterName)).filter(Boolean))];
    const actorsDoubled = [...new Set(rows.map((r) => clean(r.actorDoubled)).filter(Boolean))];
    const role = characters[0] || "Stunt Performer";
    const doubled = actorsDoubled.length ? ` (for ${actorsDoubled.join(", ")})` : "";
    credits.push({
      showName: clean(rows[0].showName),
      firstDate: dates[0] ?? "",
      lastDate: dates[dates.length - 1] ?? "",
      days: rows.length,
      characters,
      actorsDoubled,
      creditLine: `${role}${doubled}`,
    });
  }
  return credits.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}
