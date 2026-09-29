# Google Review QR Sticker Maker

Generate printable QR code stickers (with the Google logo) that take customers straight to your Google review page. Place them on your cashier desk, tables, menus and door.

## Features

- Search for your business by name and pick it from Google's suggestions, or paste your Google review link (`https://g.page/r/.../review`) or a Place ID (`ChIJ...`)
- Three sticker designs: tall card, wide (business-card) card, round
- Custom size, accent colour, business name, headline and call to action
- Print sheets for US Letter or A4 with cut lines, or download a single sticker as PNG (300 DPI) or SVG

## Business search (optional)

The "Search for your business" box suggests Google businesses as you type. Picking one fills in its review link automatically. It needs a Google Maps Platform API key:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable billing. Google includes a free monthly allowance of autocomplete requests.
2. Enable **Places API (New)**.
3. Under **APIs & Services > Credentials**, create an API key and restrict it to **Places API (New)**.
4. Set it as `GOOGLE_MAPS_API_KEY`. Locally, copy `.env.example` to `.env` and paste the key there. On Railway, add it under the service's **Variables**.

The key stays on the server and is never sent to the browser. Searches are limited to 60 per minute per visitor. Without a key, the search box is disabled, and people can still paste their review link or Place ID.

## Run locally

```bash
npm start
```

Then open http://localhost:5173. You can also open `index.html` directly in a browser.

## Deploy on Railway

Create a new Railway project from this GitHub repo. Railway detects Node, runs `npm start`, and provides the `PORT` variable automatically. No dependencies or build step are needed.
