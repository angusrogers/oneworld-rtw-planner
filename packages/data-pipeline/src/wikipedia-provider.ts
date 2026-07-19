import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { AFFILIATE_BRANDS, ALL_CARRIERS, CARRIER_NAMES } from '@rtw/shared';
import { normKey, type AirportIndex, type OaAirport } from './ourairports.js';
import type { RawRoute, RouteDataProvider } from './provider.js';

const API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT =
  'oneworld-rtw-planner/0.1 (route-graph research; contact: local build)';

/** Airline display name → operating carrier code, longest names first. */
function buildCarrierMatchers(): Array<[string, string | null]> {
  const entries: Array<[string, string | null]> = [
    // Exclusions checked before shorter prefixes can match.
    ['jetstar asia', null], // 3K — not eligible
    ['aer lingus regional', null], // operated by Emerald Airlines — not eligible
    ['american eagle', 'AA'],
  ];
  for (const [code, name] of Object.entries(CARRIER_NAMES)) {
    if (ALL_CARRIERS.has(code)) entries.push([name.toLowerCase(), code]);
  }
  for (const [brand, code] of Object.entries(AFFILIATE_BRANDS)) {
    entries.push([brand, code]);
  }
  entries.push(['srilankan', 'UL']);
  entries.sort((a, b) => b[0].length - a[0].length);
  return entries;
}

const CARRIER_MATCHERS = buildCarrierMatchers();

export function matchCarrier(airlineCell: string): string | null {
  const text = airlineCell
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Freighter operations (e.g. "Qantas Freight") are not passenger routes.
  if (/cargo|freight/.test(text)) return null;
  for (const [name, code] of CARRIER_MATCHERS) {
    if (text.startsWith(name)) return code;
  }
  return null;
}

interface CachedDest {
  href: string | null;
  text: string;
  notes: string[];
}
interface CachedRow {
  airline: string;
  destinations: CachedDest[];
}

/** Extract "Airlines and destinations" rows from airport-article HTML. */
export function parseAirlinesTables(html: string): CachedRow[] {
  const $ = cheerio.load(html);
  const rows: CachedRow[] = [];

  // Locate the section heading, then walk forward collecting wikitables until
  // the next same-or-higher-level heading.
  const headings = $('h2, h3, div.mw-heading').filter((_, el) =>
    /airlines?\s+and\s+destinations/i.test($(el).text()),
  );
  const tables = new Set<any>();
  headings.each((_, h) => {
    let node = $(h).parent().is('div.mw-heading') ? $(h).parent() : $(h);
    // cheerio: iterate siblings after the heading.
    let cur = node.next();
    let steps = 0;
    while (cur.length && steps < 30) {
      if (cur.is('h2') || cur.is('div.mw-heading2')) break;
      if (cur.is('table.wikitable')) tables.add(cur.get(0));
      cur.find?.('table.wikitable').each((_, t) => {
        tables.add(t);
      });
      cur = cur.next();
      steps++;
    }
  });
  // Fallback: some layouts nest the tables; scan all wikitables whose header
  // mentions Destinations.
  if (tables.size === 0) {
    $('table.wikitable').each((_, t) => {
      if (/destinations/i.test($(t).find('tr').first().text())) tables.add(t);
    });
  }

  for (const t of tables) {
    let carriedAirline = '';
    $(t)
      .find('tr')
      .each((_, tr) => {
        const cells = $(tr).children('td, th');
        if (cells.length === 0) return;
        let airline: string;
        let destCell: any;
        if (cells.length === 1) {
          // rowspan continuation: the airline cell spans from a previous row.
          if (!carriedAirline) return;
          airline = carriedAirline;
          destCell = cells[0];
        } else {
          airline = $(cells[0]).text().trim();
          carriedAirline = airline;
          // Destinations is the longest non-airline cell (tables often carry a
          // trailing Refs column, so "last cell" is wrong).
          destCell = cells[1];
          let best = $(cells[1]).text().length;
          for (let ci = 2; ci < cells.length; ci++) {
            const len = $(cells[ci]).text().length;
            if (len > best) {
              best = len;
              destCell = cells[ci];
            }
          }
        }
        if (!airline || /^airlines?$/i.test(airline)) return;
        const destinations: CachedDest[] = [];
        let mode: string[] = [];
        let charter = false;
        $(destCell)
          .contents()
          .each((_, node) => {
            if (node.type === 'text') {
              const txt = $(node).text();
              if (/charter/i.test(txt)) charter = true;
              if (/seasonal/i.test(txt)) mode = ['seasonal'];
              // Annotation applying to the previous destination.
              const paren = txt.match(/\(([^)]*)\)/);
              if (paren && destinations.length > 0) {
                destinations[destinations.length - 1].notes.push(paren[1].trim());
              }
            } else if (node.type === 'tag' && node.name === 'a') {
              const $a = $(node);
              const href = $a.attr('href') ?? null;
              const text = $a.text().trim();
              if (!text || /^\[/.test(text)) return;
              if (charter) return; // scheduled services only
              destinations.push({ href, text, notes: [...mode] });
            } else if (node.type === 'tag') {
              const txt = $(node).text();
              if (/charter/i.test(txt)) charter = true;
              else if (/seasonal/i.test(txt)) mode = ['seasonal'];
            }
          });
        if (destinations.length > 0) rows.push({ airline, destinations });
      });
  }
  return rows;
}

function titleFromHref(href: string | null): string | null {
  if (!href || !href.startsWith('/wiki/')) return null;
  const raw = href.slice('/wiki/'.length).split('#')[0];
  try {
    return decodeURIComponent(raw).replace(/_/g, ' ');
  } catch {
    return raw.replace(/_/g, ' ');
  }
}

/**
 * Labels Wikipedia editors use that neither the title index nor the
 * municipality fallback resolves (multi-city names, metro qualifiers, old
 * titles). Keys are normKey()-normalised.
 */
const DEST_ALIASES: Record<string, string> = {
  'dallas fort worth': 'DFW',
  'seattle tacoma': 'SEA',
  muscat: 'MCT',
  nice: 'NCE',
  'quebec city': 'YQB',
  'fayetteville bentonville': 'XNA',
  'greenville spartanburg': 'GSP',
  'milan malpensa': 'MXP',
  'milan linate': 'LIN',
  'milan bergamo': 'BGY',
  'kuala lumpur international': 'KUL',
  'kuala lumpur subang': 'SZB',
  'london heathrow': 'LHR',
  'london gatwick': 'LGW',
  'london city': 'LCY',
  'london stansted': 'STN',
  'new york jfk': 'JFK',
  'new york laguardia': 'LGA',
  'tokyo narita': 'NRT',
  'tokyo haneda': 'HND',
  'osaka kansai': 'KIX',
  'osaka itami': 'ITM',
  'rome fiumicino': 'FCO',
  'paris charles de gaulle': 'CDG',
  'paris orly': 'ORY',
  'sao paulo guarulhos': 'GRU',
  'rio de janeiro galeao': 'GIG',
  'buenos aires ezeiza': 'EZE',
  'buenos aires aeroparque': 'AEP',
  'washington national': 'DCA',
  'washington dulles': 'IAD',
  'chicago o hare': 'ORD',
  'chicago midway': 'MDW',
  'houston intercontinental': 'IAH',
  'houston hobby': 'HOU',
  'st louis': 'STL',
  'belfast city': 'BHD',
  'belfast international': 'BFS',
  'tenerife north': 'TFN',
  'tenerife south': 'TFS',
  'bangkok suvarnabhumi': 'BKK',
  'bangkok don mueang': 'DMK',
  'jakarta soekarno hatta': 'CGK',
  'seoul incheon': 'ICN',
  'seoul gimpo': 'GMP',
  'shanghai pudong': 'PVG',
  'shanghai hongqiao': 'SHA',
  'beijing capital': 'PEK',
  'beijing daxing': 'PKX',
  'taipei taoyuan': 'TPE',
  'taipei songshan': 'TSA',
  'birmingham (al)': 'BHM',
  'cedar rapids iowa city': 'CID',
  antigua: 'ANU',
  grenada: 'GND',
  providence: 'PVD',
  lihue: 'LIH',
  // 'newcastle' is deliberately absent — ambiguous between NCL (UK) and
  // NTL (Australia); better unresolved than wrong.
};

/** Resolve a destination link/text to an airport. */
export function resolveDestination(
  dest: CachedDest,
  index: AirportIndex,
): OaAirport | null {
  const title = titleFromHref(dest.href);
  if (title) {
    const hit = index.byWikiTitle.get(normKey(title));
    if (hit) return hit;
  }
  const aliased = DEST_ALIASES[normKey(dest.text)];
  if (aliased) return index.byIata.get(aliased) ?? null;
  // "City–Qualifier" anchor text (en/em dash or hyphen).
  const [cityPart, qualifier] = dest.text.split(/[–—-]/).map((s) => s.trim());
  if (qualifier && /^[A-Z]{3}$/.test(qualifier)) {
    const byCode = index.byIata.get(qualifier);
    if (byCode) return byCode;
  }
  const cityKey = normKey(cityPart ?? dest.text);
  const cityKeyMatches: OaAirport[] = [];
  for (const [key, list] of index.byMunicipality) {
    if (key.split('|')[0] === cityKey) {
      cityKeyMatches.push(...list);
    }
  }
  if (qualifier) {
    const q = normKey(qualifier);
    const named = cityKeyMatches.find((a) => normKey(a.name).includes(q));
    if (named) return named;
  }
  const scheduled = cityKeyMatches.filter((a) => a.scheduledService);
  if (scheduled.length >= 1) return scheduled[0];
  if (cityKeyMatches.length === 1) return cityKeyMatches[0];
  return null;
}

export class WikipediaProvider implements RouteDataProvider {
  name = 'wikipedia';
  unresolved = new Map<string, number>();
  private lastFetch = 0;
  /** normKey(article title) → IATA (or null for known misses); disk-cached. */
  private titleIata: Map<string, string | null> | null = null;
  private titleIataPath: string | null = null;
  /** IATA → article title, for airports ourairports has no wiki link for. */
  private titleForIata = new Map<string, string>();

  constructor(
    private index: AirportIndex,
    private cacheDir: string,
    private fetchDelayMs = 1100,
  ) {}

  private async fetchApi(params: string): Promise<any | null> {
    const url = `${API}?${params}&format=json&formatversion=2&redirects=1&maxlag=5`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = this.lastFetch + this.fetchDelayMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastFetch = Date.now();
      let status: number | string = 'network';
      try {
        // Both the fetch and the body read can fail on flaky networks (e.g.
        // machine sleep mid-request) — treat either as a retryable failure.
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        status = res.status;
        if (res.ok) return await res.json();
        if (res.status !== 429 && res.status < 500) return null; // 4xx: don't retry
      } catch {
        // fall through to backoff
      }
      const backoff = [15000, 30000, 60000][attempt] ?? 60000;
      console.warn(`  wiki ${status} (${params.slice(0, 60)}…); retrying in ${backoff / 1000}s`);
      await new Promise((r) => setTimeout(r, backoff));
    }
    console.warn(`  wiki fetch failed (${params.slice(0, 60)}…)`);
    return null;
  }

  private async fetchRows(title: string): Promise<CachedRow[] | null> {
    await mkdir(this.cacheDir, { recursive: true });
    const cachePath = path.join(
      this.cacheDir,
      `${title.replace(/[^a-zA-Z0-9]+/g, '_')}.json`,
    );
    if (existsSync(cachePath)) {
      return JSON.parse(await readFile(cachePath, 'utf8'));
    }
    const data = await this.fetchApi(
      `action=parse&page=${encodeURIComponent(title)}&prop=text`,
    );
    const html: string | undefined = data?.parse?.text;
    if (!html) return null;
    const rows = parseAirlinesTables(html);
    await writeFile(cachePath, JSON.stringify(rows));
    return rows;
  }

  /**
   * Last-resort resolution: read the linked article's infobox IATA code.
   * Needed where ourairports has no (or a stale) wikipedia_link — e.g. SCL,
   * TLS, CCS — and it disambiguates cases like Newcastle NSW vs upon Tyne.
   * Results (including misses) are cached permanently on disk.
   */
  private async loadTitleCache() {
    if (this.titleIata) return;
    this.titleIataPath = path.join(this.cacheDir, '..', 'wiki-title-iata.json');
    this.titleIata = new Map();
    if (existsSync(this.titleIataPath)) {
      const raw = JSON.parse(await readFile(this.titleIataPath, 'utf8'));
      const titles = raw.titles ?? raw; // migrate pre-split flat format
      this.titleIata = new Map(Object.entries(titles));
      for (const [iata, title] of Object.entries(raw.iataTitle ?? {})) {
        this.titleForIata.set(iata, title as string);
      }
    }
  }

  private async saveTitleCache() {
    await writeFile(
      this.titleIataPath!,
      JSON.stringify({
        titles: Object.fromEntries(this.titleIata!),
        iataTitle: Object.fromEntries(this.titleForIata),
      }),
    );
  }

  private async iataFromArticle(title: string): Promise<string | null> {
    await this.loadTitleCache();
    const key = normKey(title);
    if (this.titleIata!.has(key)) return this.titleIata!.get(key) ?? null;
    const data = await this.fetchApi(
      `action=parse&page=${encodeURIComponent(title)}&prop=wikitext&section=0`,
    );
    const wikitext: string = data?.parse?.wikitext ?? '';
    const m = wikitext.match(/\|\s*IATA\s*=\s*([A-Z0-9]{3})\b/i);
    const iata = m && this.index.byIata.has(m[1].toUpperCase()) ? m[1].toUpperCase() : null;
    this.titleIata!.set(key, iata);
    if (iata && !this.titleForIata.has(iata)) {
      this.titleForIata.set(iata, data?.parse?.title ?? title);
    }
    await this.saveTitleCache();
    return iata;
  }

  async routesFrom(iata: string): Promise<RawRoute[] | null> {
    await this.loadTitleCache();
    const airport = this.index.byIata.get(iata);
    if (!airport) return null;
    // ourairports' wikipedia_link can be missing or stale (e.g. CCS points at
    // a now-ambiguous title); fall back to the article title the infobox
    // resolution learned for this airport.
    const candidates = [airport.wikipediaTitle, this.titleForIata.get(iata)]
      .filter((t): t is string => !!t)
      .filter((t, i, arr) => arr.indexOf(t) === i);
    if (candidates.length === 0) return null;
    let rows: CachedRow[] | null = null;
    for (const title of candidates) {
      rows = await this.fetchRows(title);
      if (rows && rows.length > 0) break;
    }
    if (!rows) return null;
    const routes: RawRoute[] = [];
    // Ground-transport "flights" (BA/QF bus & rail services) are excluded
    // from the fares — drop anything annotated as surface transport.
    const GROUND = /\b(bus|train|rail|motor ?coach|ferry)\b/i;
    for (const row of rows) {
      const carrier = matchCarrier(row.airline);
      if (!carrier) continue;
      for (const dest of row.destinations) {
        if (GROUND.test(dest.text) || dest.notes.some((n) => GROUND.test(n))) continue;
        let resolved = resolveDestination(dest, this.index);
        if (!resolved) {
          const linkTitle = titleFromHref(dest.href);
          if (linkTitle) {
            const viaInfobox = await this.iataFromArticle(linkTitle);
            if (viaInfobox) resolved = this.index.byIata.get(viaInfobox) ?? null;
          }
        }
        if (!resolved) {
          this.unresolved.set(dest.text, (this.unresolved.get(dest.text) ?? 0) + 1);
          continue;
        }
        if (resolved.iata === iata) continue;
        routes.push({
          from: iata,
          to: resolved.iata,
          carrier,
          notes: dest.notes.length ? dest.notes : undefined,
        });
      }
    }
    return routes;
  }
}
