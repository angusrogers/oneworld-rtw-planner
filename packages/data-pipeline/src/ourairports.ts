import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  airportToCityCode,
  countryToContinent,
  countryToZone,
  RUSSIA_EAST_OF_URALS,
  type Airport,
} from '@rtw/shared';
import { parseCsv } from './csv.js';

const URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

export interface OaAirport extends Airport {
  wikipediaTitle?: string;
  type: string;
  scheduledService: boolean;
}

export interface AirportIndex {
  byIata: Map<string, OaAirport>;
  byWikiTitle: Map<string, OaAirport>;
  byMunicipality: Map<string, OaAirport[]>;
}

const TYPE_RANK: Record<string, number> = {
  large_airport: 3,
  medium_airport: 2,
  small_airport: 1,
};

/**
 * Normalisation for wiki-title / city lookups: Wikipedia links often use
 * redirect titles that differ from ourairports' canonical link in dashes,
 * slashes and diacritics ("Dallas/Fort_Worth…" vs "Dallas_Fort_Worth…",
 * "Seattle–Tacoma" vs "Seattle-Tacoma", "Québec" vs "Quebec").
 */
export function normKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[/_–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function loadAirports(cacheDir: string): Promise<AirportIndex> {
  await mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, 'airports.csv');
  let text: string;
  if (existsSync(cachePath)) {
    text = await readFile(cachePath, 'utf8');
  } else {
    console.log(`Downloading ${URL} …`);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`ourairports download failed: ${res.status}`);
    text = await res.text();
    await writeFile(cachePath, text);
  }

  const rows = parseCsv(text);
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const c = {
    type: col('type'),
    name: col('name'),
    lat: col('latitude_deg'),
    lon: col('longitude_deg'),
    country: col('iso_country'),
    region: col('iso_region'),
    municipality: col('municipality'),
    scheduled: col('scheduled_service'),
    iata: col('iata_code'),
    wiki: col('wikipedia_link'),
  };

  const byIata = new Map<string, OaAirport>();
  const byWikiTitle = new Map<string, OaAirport>();
  const byMunicipality = new Map<string, OaAirport[]>();

  for (const row of rows.slice(1)) {
    const iata = row[c.iata]?.trim();
    if (!iata || iata.length !== 3) continue;
    const type = row[c.type];
    if (!TYPE_RANK[type]) continue; // skip heliports, closed, seaplane bases
    const country = row[c.country];
    const continent = RUSSIA_EAST_OF_URALS.has(iata)
      ? ('AS' as const)
      : countryToContinent(country);
    if (!continent) continue; // Antarctica etc.
    const regionRaw = row[c.region] ?? '';
    const region = regionRaw.includes('-') ? regionRaw.split('-')[1] : undefined;
    const wikiUrl = row[c.wiki]?.trim();
    const wikipediaTitle = wikiUrl
      ? decodeURIComponent(wikiUrl.split('/wiki/')[1] ?? '').replace(/_/g, ' ') || undefined
      : undefined;
    const airport: OaAirport = {
      iata,
      name: row[c.name],
      city: row[c.municipality] || row[c.name],
      cityCode: airportToCityCode(iata),
      country,
      continent,
      zone: continent === 'EUME' ? countryToZone(country) : undefined,
      region,
      lat: parseFloat(row[c.lat]),
      lon: parseFloat(row[c.lon]),
      wikipediaTitle,
      type,
      scheduledService: row[c.scheduled] === 'yes',
    };
    const existing = byIata.get(iata);
    if (!existing || TYPE_RANK[type] > TYPE_RANK[existing.type]) {
      byIata.set(iata, airport);
    }
  }

  for (const a of byIata.values()) {
    if (a.wikipediaTitle) byWikiTitle.set(normKey(a.wikipediaTitle), a);
    const key = `${normKey(a.city)}|${a.country}`;
    byMunicipality.set(key, [...(byMunicipality.get(key) ?? []), a]);
  }
  // Highest-ranked airport first for municipality fallback resolution.
  for (const list of byMunicipality.values()) {
    list.sort(
      (a, b) =>
        Number(b.scheduledService) - Number(a.scheduledService) ||
        TYPE_RANK[b.type] - TYPE_RANK[a.type],
    );
  }

  console.log(`ourairports: ${byIata.size} IATA airports indexed`);
  return { byIata, byWikiTitle, byMunicipality };
}
