# ✦ GALACTIC COMMUTE — NAVIGATIONAL SYSTEM v2.0

**Galactic Commute** is an Empire-grade, health-aware navigation web app — built with React, Leaflet, and a Node.js intelligence backend.

It calculates up to 3 driving routes between any two locations, ranks them by a real-time **Force Score** (health index) based on live air quality and temperature data, and guides you turn-by-turn through the galaxy.

---

## ⚙️ Tech Stack

- **[React](https://react.dev/)** — Front-end UI framework powering the HUD panel, navigation overlay, starfield, and route cards. Hooks-based with `useState`, `useEffect`, `useRef`, and `useCallback`.

- **[Leaflet.js](https://leafletjs.com/)** — Interactive map rendering with dark-mode CartoDB tiles, GeoJSON route drawing, custom user-dot markers, and dynamic fit-bounds on route selection.

- **[Node.js + Express](https://expressjs.com/)** — Backend intelligence server. Handles geocoding, routing, air quality, weather data, health score computation, and step extraction. Served on port 3000.

- **[Mapbox Geocoding API](https://docs.mapbox.com/api/search/geocoding/)** — Converts plain-text location names (e.g. "Kota", "Jaipur") into precise `[lon, lat]` coordinates, restricted to India (`country=IN`).

- **[Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)** — Retrieves up to 3 alternative driving routes with full GeoJSON geometries, step-level maneuver data, and banner instructions for turn-by-turn navigation.

- **[OpenWeatherMap Air Pollution API](https://openweathermap.org/api/air-pollution)** — Fetches real-time PM2.5 particulate matter levels sampled at multiple points along each route.

- **[OpenWeatherMap Current Weather API](https://openweathermap.org/current)** — Retrieves ambient temperature (°C) at the destination to factor into the Force Score health computation.

- **[@turf/turf](https://turfjs.org/)** — Geospatial analysis library used to measure route length and sample equidistant points along the route geometry for AQI data collection.

- **[dotenv](https://www.npmjs.com/package/dotenv)** — Loads environment variables (API keys) from a `.env` file into the backend process.

- **[cors](https://www.npmjs.com/package/cors)** — Enables Cross-Origin Resource Sharing so the React frontend can communicate with the Express backend during local development.

---

## 🔋 Features

- ✅ **Empire HUD Interface** — A sleek dark-side sidebar with scan-lines, glowing inputs, animated starfield background, and Imperial branding (`EMPIRE NAVIGATION CORPS`).

- ✅ **Multi-Route Analysis** — Fetches up to 3 driving routes simultaneously and displays them as *Healthiest*, *Fastest*, and *Secondary* route cards.

- ✅ **Force Score™** — A proprietary health scoring system (0–100) computed from real-time PM2.5 air quality, ambient temperature, and route duration. Routes are labelled `LIGHT SIDE`, `NEUTRAL`, or `DARK SIDE` accordingly.

- ✅ **Live Air Quality Sampling** — AQI data is collected at points every 300m along each route using Turf.js interpolation, then averaged to produce a route-level PM2.5 score.

- ✅ **Turn-by-Turn Navigation** — Full GPS-tracked navigation mode with step advancement, distance-to-next-maneuver display, a next-step preview, a visual progress bar, and an arrival overlay.

- ✅ **Manual Step Override** — Waypoint advance/retreat buttons allow full navigation testing without GPS access (useful in emulators or desktop browsers).

- ✅ **Live User Dot** — Animated user position marker (`user-dot`) tracked via the browser's Geolocation API with `watchPosition`, updating continuously at high accuracy.

- ✅ **Swap Trajectory** — One-click origin/destination inversion (`⇅`) with automatic route and navigation reset.

- ✅ **Dark CartoDB Map** — Styled dark-mode tile layer for maximum Imperial aesthetic.

- ✅ **Route Colour Coding** — Healthiest route renders in `#00ff88` (green), Fastest in `#4da6ff` (blue), and Secondary in `#ffe81f` (yellow) on the map.

- ✅ **AQI Caching** — Backend de-duplicates AQI requests within the same route calculation using a coordinate-keyed `Map` cache, reducing redundant API calls.

- ✅ **Animated Starfield** — 120 procedurally generated stars with randomised size, position, and twinkling animation for full deep-space ambiance.

---

## 🤸 Quick Start

Follow these steps to deploy the system on your local machine.

**Prerequisites**

Make sure you have the following installed:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/en) (v18+ recommended)
- [npm](https://www.npmjs.com/)

**Cloning the Repository**

```bash
git clone https://github.com/delusionalbrain/HealthyCommute
cd HealthyCommute
```

**Installing Dependencies**

Backend:
```bash
npm install
```

Frontend (if in a separate `/client` directory):
```bash
cd client
npm install
```

**Set Up Environment Variables**

Create a `.env` file in the root of the project:

```env
# Mapbox — Geocoding & Directions
MAPBOX_ACCESS_TOKEN=

# OpenWeatherMap — Air Quality & Weather
OPENWEATHER_API_KEY=

# Server
PORT=3000
```

Replace the placeholders with your real credentials. Get them here:
- [Mapbox](https://account.mapbox.com/) — free tier available
- [OpenWeatherMap](https://openweathermap.org/api) — free tier includes Air Pollution + Current Weather

**Running the Project**

Start the backend server:
```bash
node index.js
```

Start the React frontend:
```bash
npm start
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (backend) and your React dev server (usually [http://localhost:5173](http://localhost:5173) or [http://localhost:3001](http://localhost:3001)) in your browser.

---

## 🗂️ Project Structure

```
galactic-commute/
├── index.js          # Express backend — routing, geocoding, AQI, health score
├── App.jsx           # React frontend — HUD, map, navigation UI
├── App.css           # Imperial styling — dark theme, animations, HUD components
├── .env              # API keys (not committed)
└── README.md
```

---

## 🧮 Force Score Formula

The health score for each route is computed on the backend as follows:

```
healthScore = 100
healthScore -= (avgPM2.5 × 0.4)
healthScore -= ((temp - 32) × 1.5)   [only if temp > 32°C]
healthScore -= (durationMins × 0.2)
healthScore = clamp(healthScore, 0, 100)
```

| Score Range | Force Alignment |
|-------------|-----------------|
| 80 – 100    | 🟢 LIGHT SIDE   |
| 50 – 79     | 🟡 NEUTRAL      |
| 0 – 49      | 🔴 DARK SIDE    |

---

## 🌐 API Endpoints

| Method | Endpoint     | Description                                         |
|--------|--------------|-----------------------------------------------------|
| POST   | `/api/routes` | Accepts `{ start, end }` strings. Returns `fastest`, `healthiest`, and `secondHealthiest` route objects with geometry, steps, metrics, and health scores. |

---

> *The Empire does not negotiate with congestion. Plan your route accordingly.*
>
> **EMPIRE NAVIGATION CORPS** — *Serving the Galactic Empire since 19 BBY*