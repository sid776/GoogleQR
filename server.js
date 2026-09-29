const http = require('http');
const fs = require('fs');
const path = require('path');

try { process.loadEnvFile?.(path.join(__dirname, '.env')); } catch { /* no .env file */ }

const PORT = Number(process.env.PORT) || 5173;
const PLACES_KEY = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
const ROOT = __dirname;
const PUBLIC_FILES = new Set(['/index.html', '/styles.css', '/app.js', '/lib/qrcode.js', '/lib/qrcode_UTF8.js']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

// Per-IP limit on business searches so a public deployment can't run up the Google bill.
const RATE_LIMIT = { windowMs: 60_000, max: 60 };
const hits = new Map();
const cache = new Map();
const CACHE_MAX = 500;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
}

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 10_000) hits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

async function searchPlaces(query) {
  const key = query.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const resp = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_KEY },
    body: JSON.stringify({ input: query }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.error?.message || `Google Places request failed (${resp.status})`);
    err.status = resp.status;
    throw err;
  }

  const all = (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter((p) => p && p.placeId)
    .map((p) => ({
      placeId: p.placeId,
      name: p.structuredFormat?.mainText?.text || p.text?.text || '',
      address: p.structuredFormat?.secondaryText?.text || '',
      isBusiness: (p.types || []).some((t) => t === 'establishment' || t === 'point_of_interest'),
    }));
  const businesses = all.filter((p) => p.isBusiness);
  const results = (businesses.length ? businesses : all).map(({ isBusiness, ...p }) => p);

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, results);
  return results;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/config') {
    return sendJson(res, 200, { placesEnabled: Boolean(PLACES_KEY) });
  }

  if (url.pathname === '/api/places') {
    if (!PLACES_KEY) {
      return sendJson(res, 503, { error: 'Business search is not set up. Add GOOGLE_MAPS_API_KEY to the server.' });
    }
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2 || q.length > 120) return sendJson(res, 400, { error: 'Type 2 to 120 characters.' });
    if (rateLimited(clientIp(req))) return sendJson(res, 429, { error: 'Too many searches. Wait a minute and try again.' });

    try {
      return sendJson(res, 200, { results: await searchPlaces(q) });
    } catch (err) {
      console.error('Places autocomplete error:', err.message);
      return sendJson(res, 502, { error: err.message });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      console.error(err);
      sendJson(res, 500, { error: 'Server error' });
    });
    return;
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!PUBLIC_FILES.has(pathname)) {
    res.writeHead(404);
    return res.end('Not found');
  }

  const file = path.join(ROOT, pathname);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Review QR Sticker Maker running at http://localhost:${PORT}`);
  console.log(PLACES_KEY ? 'Business search: enabled' : 'Business search: disabled (set GOOGLE_MAPS_API_KEY to enable)');
});
