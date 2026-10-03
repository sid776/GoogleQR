const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try { process.loadEnvFile?.(path.join(__dirname, '.env')); } catch { /* no .env file */ }

const PORT = Number(process.env.PORT) || 5173;
const PLACES_KEY = (process.env.GOOGLE_MAPS_API_KEY || '').trim();

const STRIPE_KEY = (process.env.STRIPE_SECRET_KEY || '').trim();
const PRICE_CENTS = Number(process.env.PRICE_CENTS) || 1999;
const CURRENCY = (process.env.CURRENCY || 'usd').trim().toLowerCase();
const PRODUCT_NAME = process.env.PRODUCT_NAME || 'Google Review QR Stickers – unlimited printing & downloads';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
// Unlock codes are signed with this secret; changing it invalidates every code already issued.
const UNLOCK_SECRET = (process.env.UNLOCK_SECRET || '').trim() ||
  (STRIPE_KEY ? crypto.createHash('sha256').update('unlock:' + STRIPE_KEY).digest('hex') : '');
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

function rateLimited(ip, bucket = 'places') {
  const now = Date.now();
  const id = bucket + ':' + ip;
  const entry = hits.get(id);
  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    hits.set(id, { start: now, count: 1 });
    if (hits.size > 10_000) hits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

// Daily cap on paid Google calls. Google bills autocomplete at $2.83 per 1,000 after 10,000 free
// calls a month, so 370/day (11,470 in a 31-day month) keeps the bill under about $5.
const PLACES_DAILY_LIMIT = Number(process.env.PLACES_DAILY_LIMIT) || 370;
const USAGE_FILE = path.join(__dirname, '.places-usage.json');
const usage = loadUsage();

function pacificDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}

function loadUsage() {
  try {
    const saved = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    if (typeof saved.day === 'string' && Number.isFinite(saved.count)) return saved;
  } catch { /* no usage recorded yet */ }
  return { day: pacificDate(), count: 0 };
}

function takePlacesCall() {
  const today = pacificDate();
  if (usage.day !== today) Object.assign(usage, { day: today, count: 0 });
  if (usage.count >= PLACES_DAILY_LIMIT) return false;
  usage.count += 1;
  fs.writeFile(USAGE_FILE, JSON.stringify(usage), () => {});
  return true;
}

const DAILY_LIMIT_MESSAGE = "Business search has reached today's limit. Paste your review link below instead, or try again tomorrow.";

async function searchPlaces(query) {
  const key = query.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  if (!takePlacesCall()) {
    const err = new Error(DAILY_LIMIT_MESSAGE);
    err.status = 429;
    throw err;
  }

  const resp = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_KEY },
    body: JSON.stringify({ input: query }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const quotaHit = resp.status === 429;
    const err = new Error(quotaHit ? DAILY_LIMIT_MESSAGE : data?.error?.message || `Google Places request failed (${resp.status})`);
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

// ------------------------------------------------------------------ Stripe

async function stripeRequest(method, endpoint, params = {}) {
  const query = new URLSearchParams(params).toString();
  const isGet = method === 'GET';
  const resp = await fetch(`https://api.stripe.com/v1${endpoint}${isGet && query ? '?' + query : ''}`, {
    method,
    headers: {
      Authorization: 'Bearer ' + STRIPE_KEY,
      ...(isGet ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
    },
    body: isGet ? undefined : query,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error?.message || `Stripe request failed (${resp.status})`);
  return data;
}

function sign(value) {
  return crypto.createHmac('sha256', UNLOCK_SECRET).update(value).digest('base64url');
}

function makeUnlockToken(sessionId) {
  return `${sessionId}.${sign(sessionId)}`;
}

function isValidUnlockToken(token) {
  if (typeof token !== 'string' || !UNLOCK_SECRET) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const expected = Buffer.from(sign(token.slice(0, dot)));
  const given = Buffer.from(token.slice(dot + 1));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function siteOrigin(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  return `${proto}://${req.headers.host}`;
}

async function handlePayments(req, res, url) {
  if (!STRIPE_KEY) return sendJson(res, 503, { error: 'Payments are not set up on this server.' });

  if (url.pathname === '/api/checkout') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST' });
    if (rateLimited(clientIp(req), 'checkout')) return sendJson(res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
    const origin = siteOrigin(req);
    const session = await stripeRequest('POST', '/checkout/sessions', {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': CURRENCY,
      'line_items[0][price_data][unit_amount]': String(PRICE_CENTS),
      'line_items[0][price_data][product_data][name]': PRODUCT_NAME,
      allow_promotion_codes: 'true',
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
    });
    return sendJson(res, 200, { url: session.url });
  }

  if (url.pathname === '/api/checkout/verify') {
    const sessionId = url.searchParams.get('session_id') || '';
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return sendJson(res, 400, { error: 'Invalid checkout session.' });
    const session = await stripeRequest('GET', `/checkout/sessions/${sessionId}`);
    if (session.payment_status !== 'paid') return sendJson(res, 402, { error: 'Payment has not been completed.' });
    return sendJson(res, 200, { token: makeUnlockToken(session.id) });
  }

  if (url.pathname === '/api/unlock/check') {
    return sendJson(res, 200, { valid: isValidUnlockToken(url.searchParams.get('token')) });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/config') {
    return sendJson(res, 200, {
      placesEnabled: Boolean(PLACES_KEY),
      payments: STRIPE_KEY ? { enabled: true, amount: PRICE_CENTS, currency: CURRENCY } : { enabled: false },
    });
  }

  if (url.pathname === '/api/checkout' || url.pathname.startsWith('/api/checkout/') || url.pathname === '/api/unlock/check') {
    try {
      return await handlePayments(req, res, url);
    } catch (err) {
      console.error('Stripe error:', err.message);
      return sendJson(res, 502, { error: 'Payments are temporarily unavailable. Please try again in a few minutes.' });
    }
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
      return sendJson(res, err.status === 429 ? 429 : 502, { error: err.message });
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
  console.log(PLACES_KEY
    ? `Business search: enabled (limit ${PLACES_DAILY_LIMIT} Google calls/day, ${usage.count} used today)`
    : 'Business search: disabled (set GOOGLE_MAPS_API_KEY to enable)');
  console.log(STRIPE_KEY
    ? `Payments: enabled (${(PRICE_CENTS / 100).toFixed(2)} ${CURRENCY.toUpperCase()}, ${STRIPE_KEY.startsWith('sk_live_') ? 'LIVE' : 'test'} mode)`
    : 'Payments: disabled, app is free (set STRIPE_SECRET_KEY to enable)');
});
