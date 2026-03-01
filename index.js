require('dotenv').config();
const express = require('express');
const cors = require('cors');
const turf = require('@turf/turf');
const app = express();

app.use(cors());
app.use(express.json());

// --- API KEYS ---
const OWM_API_KEY = process.env.OPENWEATHER_API_KEY;
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

// 1. GEOCODING — Nominatim
async function getCoordinates(query) {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=IN&limit=1&access_token=${MAPBOX_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.features || data.features.length === 0) throw new Error(`Location not found: ${query}`);
    console.log(`Geocoded "${query}" to: ${data.features[0].place_name}`);
    return data.features[0].center; // [lon, lat]
}

// 2. AIR QUALITY — PM2.5
async function getAirQuality(lon, lat) {
    const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OWM_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    let pm25 = 15;
    if (data.list && data.list[0] && data.list[0].components) {
        pm25 = data.list[0].components.pm2_5 ?? 15;
    }
    return pm25;
}

// 3. WEATHER — temperature
async function getWeather(lon, lat) {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OWM_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.main?.temp ?? 35;
}

// 4. ROUTING — Mapbox Directions with steps=true for turn-by-turn
async function getRoutes(startCoords, endCoords) {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}?alternatives=true&geometries=geojson&overview=full&steps=true&banner_instructions=true&access_token=${MAPBOX_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.message) throw new Error(`Mapbox Directions Error: ${data.message}`);
    if (!data.routes || data.routes.length === 0) throw new Error("No driving routes found.");
    return data.routes;
}

// Helper: parse Mapbox maneuver type → direction arrow
function getManeuverIcon(type, modifier) {
    const mod = modifier || '';
    if (type === 'turn') {
        if (mod.includes('left')) return mod.includes('sharp') ? '↰' : mod.includes('slight') ? '↖' : '←';
        if (mod.includes('right')) return mod.includes('sharp') ? '↱' : mod.includes('slight') ? '↗' : '→';
        return '↑';
    }
    if (type === 'depart') return '🚀';
    if (type === 'arrive') return '🏁';
    if (type === 'merge') return mod.includes('left') ? '⬅' : '➡';
    if (type === 'roundabout' || type === 'rotary') return '🔄';
    if (type === 'fork') return mod.includes('left') ? '↖' : '↗';
    if (type === 'end of road') return mod.includes('left') ? '←' : '→';
    return '↑';
}

// Helper: extract clean steps from Mapbox legs
function extractSteps(route) {
    const steps = [];
    for (const leg of route.legs) {
        for (const step of leg.steps) {
            const maneuver = step.maneuver;
            steps.push({
                instruction: step.bannerInstructions?.[0]?.primary?.text || maneuver.instruction || 'Continue',
                icon: getManeuverIcon(maneuver.type, maneuver.modifier),
                distanceM: Math.round(step.distance),
                durationS: Math.round(step.duration),
                type: maneuver.type,
                modifier: maneuver.modifier || '',
                location: maneuver.location, // [lon, lat] of this step
            });
        }
    }
    return steps;
}

app.post('/api/routes', async (req, res) => {
    const { start, end } = req.body;
    if (!start || !end) return res.status(400).json({ error: "Start and end locations required." });

    try {
        const startCoords = await getCoordinates(start);
        const endCoords = await getCoordinates(end);
        const osrmRoutes = await getRoutes(startCoords, endCoords);
        const routeTemp = await getWeather(endCoords[0], endCoords[1]);

        const aqiCache = new Map();
        async function getCachedAQI(lon, lat) {
            const key = `${lon.toFixed(3)},${lat.toFixed(3)}`;
            if (aqiCache.has(key)) return aqiCache.get(key);
            const pm25 = await getAirQuality(lon, lat);
            aqiCache.set(key, pm25);
            return pm25;
        }

        let processedRoutes = await Promise.all(osrmRoutes.map(async (route, index) => {
            const durationMins = Math.round(route.duration / 60);
            const distanceKm = (route.distance / 1000).toFixed(1);

            const routeLength = turf.length(route.geometry, { units: 'kilometers' });
            const samplePoints = [];
            for (let d = 0; d <= routeLength; d += 0.3) {
                const pt = turf.along(route.geometry, d, { units: 'kilometers' });
                samplePoints.push(pt.geometry.coordinates);
            }

            const pm25Results = await Promise.all(
                samplePoints.map(coords => getCachedAQI(coords[0], coords[1]))
            );
            const avgPm25 = pm25Results.reduce((sum, val) => sum + val, 0) / pm25Results.length;

            let healthScore = 100;
            healthScore -= (avgPm25 * 0.4);
            if (routeTemp > 32) healthScore -= ((routeTemp - 32) * 1.5);
            healthScore -= (durationMins * 0.2);
            healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

            const routeName = route.legs[0].summary || `Alternative Route ${index + 1}`;
            const steps = extractSteps(route);

            return {
                id: `route-${index}`,
                name: routeName,
                durationMins,
                distanceKm,
                healthScore,
                metrics: { pm25: Math.round(avgPm25), tempCelsius: routeTemp },
                geometry: route.geometry,
                steps, // ← NEW: turn-by-turn steps
            };
        }));

        const fastestRoute = [...processedRoutes].sort((a, b) => a.durationMins - b.durationMins)[0];
        const healthSortedRoutes = [...processedRoutes].sort((a, b) => b.healthScore - a.healthScore);
        const healthiestRoute = healthSortedRoutes[0] || fastestRoute;
        const secondHealthiestRoute = healthSortedRoutes[1] || healthiestRoute;

        res.json({ fastest: fastestRoute, healthiest: healthiestRoute, secondHealthiest: secondHealthiestRoute });

    } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch route data." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));