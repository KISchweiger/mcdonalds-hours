// fetch-and-generate.js
// Ruft für alle 8 McDonald's-Standorte die Öffnungszeiten via Google Places API ab
// und schreibt eine HTML-Datei nach ../docs/index.html

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Konfiguration ───────────────────────────────────────────────────────────

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('Fehler: GOOGLE_PLACES_API_KEY ist nicht gesetzt.');
  process.exit(1);
}

const LOCATIONS = [
  { key: 'lohmuehle_luebeck',    name: 'Lübeck – Lohmühle',       placeId: 'ChIJVVTunQcMskcR0TA7-6s_q48' },
  { key: 'kirschkaten_luebeck',  name: 'Lübeck – Kirschkaten',    placeId: 'ChIJXwAFPTcJskcRJ_2M3HAenlI' },
  { key: 'oldenburg_holstein',   name: 'Oldenburg in Holstein',   placeId: 'ChIJKTC7-i9-skcROXp5enfoeEg' },
  { key: 'neustadt',             name: 'Neustadt in Holstein',    placeId: 'ChIJ-2AzcxV3skcRb4OTX_G2j5E' },
  { key: 'eutin',                name: 'Eutin',                   placeId: 'ChIJdU8qK-RvskcReDqMTFaZ1r0' },
  { key: 'fehmarn',              name: 'Fehmarn',                 placeId: 'ChIJBza-PUt7rUcRADPR2G3jAa0' },
  { key: 'bahnhof_luebeck',     name: 'Lübeck – Bahnhof',        placeId: 'ChIJEVNqo1QJskcR4H0wkQWEhFw' },
  { key: 'ziegelstrasse_luebeck',name: 'Lübeck – Ziegelstraße',  placeId: 'ChIJ-ekKoL8OskcRM1uwP8gPEVk' },
];

// Wochentage auf Deutsch (Google liefert englisch)
const DAY_MAP = {
  Monday: 'Montag', Tuesday: 'Dienstag', Wednesday: 'Mittwoch',
  Thursday: 'Donnerstag', Friday: 'Freitag', Saturday: 'Samstag', Sunday: 'Sonntag'
};

// ─── API-Abruf ────────────────────────────────────────────────────────────────

async function fetchPlaceDetails(placeId) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'name,formatted_address,formatted_phone_number,opening_hours,business_status');
  url.searchParams.set('language', 'de');
  url.searchParams.set('key', API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status} für Place ID ${placeId}`);

  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`Places API Status: ${data.status} für ${placeId}`);

  return data.result;
}

async function fetchAllLocations() {
  const results = [];
  for (const loc of LOCATIONS) {
    try {
      console.log(`Abruf: ${loc.name} …`);
      const details = await fetchPlaceDetails(loc.placeId);
      results.push({
        key: loc.key,
        name: loc.name,
        address: details.formatted_address ?? '–',
        phone: details.formatted_phone_number ?? '–',
        status: details.business_status ?? 'UNKNOWN',
        weekdayText: details.opening_hours?.weekday_text ?? [],
        openNow: details.opening_hours?.open_now ?? null,
      });
      // Kurze Pause zwischen Requests (Rate Limiting)
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`Fehler bei ${loc.name}: ${err.message}`);
      results.push({
        key: loc.key,
        name: loc.name,
        address: '–',
        phone: '–',
        status: 'ERROR',
        weekdayText: [],
        openNow: null,
        error: err.message,
      });
    }
  }
  return results;
}

// ─── HTML-Generierung ─────────────────────────────────────────────────────────

function buildHtml(locations, updatedAt) {
  const cards = locations.map(loc => {
    const isError = loc.status === 'ERROR';
    const isClosed = loc.status === 'CLOSED_TEMPORARILY' || loc.status === 'CLOSED_PERMANENTLY';

    const statusBadge = isError
      ? `<span class="badge badge-error">Fehler</span>`
      : isClosed
        ? `<span class="badge badge-closed">Vorübergehend geschlossen</span>`
        : loc.openNow === true
          ? `<span class="badge badge-open">Jetzt geöffnet</span>`
          : loc.openNow === false
            ? `<span class="badge badge-closed">Jetzt geschlossen</span>`
            : '';

    const hoursRows = loc.weekdayText.length > 0
      ? loc.weekdayText.map(line => {
          // "Montag: 08:00–00:00" → zwei Spalten
          const colonIdx = line.indexOf(':');
          const day = colonIdx > -1 ? line.slice(0, colonIdx) : line;
          const time = colonIdx > -1 ? line.slice(colonIdx + 1).trim() : '';
          return `<tr><td class="day">${day}</td><td class="time">${time}</td></tr>`;
        }).join('\n')
      : `<tr><td colspan="2" class="no-data">Keine Daten verfügbar</td></tr>`;

    return `
    <div class="card" data-key="${loc.key}">
      <div class="card-header">
        <div>
          <div class="loc-name">${loc.name}</div>
          <div class="loc-addr">${loc.address}</div>
          <div class="loc-phone">📞 ${loc.phone}</div>
        </div>
        <div>${statusBadge}</div>
      </div>
      <table class="hours-table">
        <tbody>${hoursRows}</tbody>
      </table>
      ${isError ? `<div class="error-msg">⚠ ${loc.error}</div>` : ''}
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>McDonald's Öffnungszeiten – Lübeck-Region</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f3;
      color: #1a1a18;
      padding: 2rem 1rem;
      font-size: 15px;
      line-height: 1.5;
    }

    header {
      max-width: 800px;
      margin: 0 auto 2rem;
    }
    header h1 {
      font-size: 20px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    .meta {
      font-size: 12px;
      color: #888;
    }

    .grid {
      max-width: 800px;
      margin: 0 auto;
      display: grid;
      gap: 12px;
    }

    .card {
      background: #fff;
      border: 0.5px solid rgba(0,0,0,0.12);
      border-radius: 12px;
      padding: 1rem 1.25rem;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      gap: 12px;
    }

    .loc-name { font-size: 15px; font-weight: 500; }
    .loc-addr { font-size: 12px; color: #666; margin-top: 2px; }
    .loc-phone { font-size: 12px; color: #666; margin-top: 2px; }

    .badge {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 20px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .badge-open   { background: #eaf3de; color: #3b6d11; }
    .badge-closed { background: #faeeda; color: #854f0b; }
    .badge-error  { background: #fcebeb; color: #a32d2d; }

    .hours-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .hours-table td {
      padding: 3px 0;
      vertical-align: top;
    }
    .hours-table .day {
      width: 110px;
      color: #666;
    }
    .hours-table .time { color: #1a1a18; }
    .no-data { color: #aaa; font-style: italic; }
    .error-msg {
      margin-top: 8px;
      font-size: 12px;
      color: #a32d2d;
      background: #fcebeb;
      padding: 6px 10px;
      border-radius: 6px;
    }

    footer {
      max-width: 800px;
      margin: 2rem auto 0;
      font-size: 12px;
      color: #aaa;
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <h1>McDonald's Öffnungszeiten – Lübeck-Region</h1>
    <div class="meta">Zuletzt aktualisiert: ${updatedAt} · Quelle: Google Places API · 8 Standorte</div>
  </header>

  <main class="grid">
    ${cards}
  </main>

  <footer>
    Daten werden täglich automatisch aktualisiert.
  </footer>
</body>
</html>`;
}

// ─── JSON-Export (für fonio / n8n) ───────────────────────────────────────────

function buildJson(locations, updatedAt) {
  return JSON.stringify({
    updated_at: updatedAt,
    locations: locations.map(loc => ({
      key: loc.key,
      name: loc.name,
      address: loc.address,
      phone: loc.phone,
      status: loc.status,
      open_now: loc.openNow,
      weekday_hours: loc.weekdayText,
    }))
  }, null, 2);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const updatedAt = new Date().toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  console.log('Starte Abruf der Öffnungszeiten …');
  const locations = await fetchAllLocations();

  // Ausgabeordner anlegen
  const docsDir = path.join(__dirname, '..', 'docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  // HTML schreiben
  const html = buildHtml(locations, updatedAt);
  fs.writeFileSync(path.join(docsDir, 'index.html'), html, 'utf8');
  console.log('✓ docs/index.html geschrieben');

  // JSON schreiben (für fonio-Webhook oder n8n HTTP-Node)
  const json = buildJson(locations, updatedAt);
  fs.writeFileSync(path.join(docsDir, 'hours.json'), json, 'utf8');
  console.log('✓ docs/hours.json geschrieben');

  console.log(`\nFertig – ${locations.length} Standorte verarbeitet (${updatedAt})`);
})();
