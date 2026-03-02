import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Distance between two [lon,lat] points in metres (Haversine)
function haversineM(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const sinA = Math.sin(dLat / 2);
  const sinB = Math.sin(dLon / 2);
  const c = sinA * sinA + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinB * sinB;
  return R * 2 * Math.asin(Math.sqrt(c));
}

function App() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [routes, setRoutes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stars, setStars] = useState([]);

  // Navigation state
  const [navActive, setNavActive] = useState(false);
  const [navRoute, setNavRoute] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [distToNext, setDistToNext] = useState(null);

  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const watchIdRef = useRef(null);

  // Stars
  useEffect(() => {
    setStars(Array.from({ length: 120 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      delay: Math.random() * 4,
      duration: Math.random() * 3 + 2,
    })));
  }, []);

  // Init map
  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map('map-container', { zoomControl: false })
        .setView([25.2023, 75.8333], 13);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(mapRef.current);
      L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
    }
  }, []);

  // ─── STOP NAV ────────────────────────────────────────────────────────────────

  const stopNavigation = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (userMarkerRef.current && mapRef.current) {
      mapRef.current.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
    setNavActive(false);
    setNavRoute(null);
    setCurrentStep(0);
    setDistToNext(null);
  }, []);

  useEffect(() => () => stopNavigation(), [stopNavigation]);

  // ─── START NAV ───────────────────────────────────────────────────────────────

  const startNavigation = useCallback((route) => {
    if (!('geolocation' in navigator)) {
      alert('Geolocation not supported. Use a real device or allow location access.');
      return;
    }

    setNavRoute(route);
    setNavActive(true);
    setCurrentStep(0);
    drawRoute(route.geometry, '#00ff88');


    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lonLat = [pos.coords.longitude, pos.coords.latitude];
        const map = mapRef.current;
        if (!map) return;

        // User dot marker
        const icon = L.divIcon({ className: '', html: `<div class="user-dot"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng([lonLat[1], lonLat[0]]);
        } else {
          userMarkerRef.current = L.marker([lonLat[1], lonLat[0]], { icon }).addTo(map);
        }
        map.setView([lonLat[1], lonLat[0]], 17, { animate: true });

        // Step advancement
        setCurrentStep((prevStep) => {
          const steps = route.steps;
          if (!steps || prevStep >= steps.length - 1) return prevStep;
          const nextStep = steps[prevStep + 1];
          if (!nextStep?.location) return prevStep;
          const dist = haversineM(lonLat, nextStep.location);
          setDistToNext(Math.round(dist));
          if (dist < 30) {
            const afterNext = steps[prevStep + 2];
            return prevStep + 1;
          }
          return prevStep;
        });
      },
      (err) => {
        console.warn('GPS error:', err.message);
        // Fallback: place marker at route start so UI is still usable
        const startCoord = route.geometry?.coordinates?.[0];
        if (startCoord && mapRef.current) {
          const icon = L.divIcon({ className: '', html: `<div class="user-dot"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
          if (!userMarkerRef.current) {
            userMarkerRef.current = L.marker([startCoord[1], startCoord[0]], { icon }).addTo(mapRef.current);
          }
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }, []);

  // ─── MAP DRAW ────────────────────────────────────────────────────────────────

  const drawRoute = (geoJsonData, color) => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);
    routeLayerRef.current = L.geoJSON(geoJsonData, {
      style: { color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' },
    }).addTo(map);
    map.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
  };

  // ─── FETCH ───────────────────────────────────────────────────────────────────

  const swapLocations = () => {
    setStart(end); setEnd(start); setRoutes(null); stopNavigation();
    if (routeLayerRef.current && mapRef.current) mapRef.current.removeLayer(routeLayerRef.current);
  };

  const fetchRoutes = async () => {
    if (!start || !end) { alert('Enter both origin and destination, you must.'); return; }
    setLoading(true); setError(''); setRoutes(null); stopNavigation();
    try {
      const res = await fetch('http://localhost:3000/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRoutes(data);
      drawRoute(data.healthiest.geometry, '#00ff88');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  const getHealthLabel = (s) => s >= 80 ? 'LIGHT SIDE' : s >= 50 ? 'NEUTRAL' : 'DARK SIDE';
  const getHealthColor = (s) => s >= 80 ? '#00ff88' : s >= 50 ? '#ffe81f' : '#ff4444';

  const steps = navRoute?.steps || [];
  const step = steps[currentStep];
  const nextStep = steps[currentStep + 1];
  const progressPct = steps.length > 1 ? Math.round((currentStep / (steps.length - 1)) * 100) : 0;

  const ROUTE_CONFIGS = [
    { key: 'healthiest',      label: 'HEALTHIEST ROUTE', badge: 'OPTIMAL PATH', badgeCls: 'badge-green',  cls: 'route-healthiest', color: '#00ff88' },
    { key: 'fastest',         label: 'RAPID VECTOR',     badge: 'FASTEST',      badgeCls: 'badge-blue',   cls: 'route-fastest',    color: '#4da6ff' },
    { key: 'secondHealthiest',label: 'SECONDARY PATH',   badge: 'ALTERNATE',    badgeCls: 'badge-yellow', cls: 'route-secondary',  color: '#ffe81f' },
  ];

  const useCurrentLocation = () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(6);
      const lon = pos.coords.longitude.toFixed(6);
      setStart(`${lat}, ${lon}`);
    },
    (err) => {
      alert("Location access denied or unavailable");
    },
    { enableHighAccuracy: true }
  );
};


  // ─── RENDER ──────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      {/* Starfield */}
      <div className="starfield">
        {stars.map((s) => (
          <div key={s.id} className="star" style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: `${s.size}px`, height: `${s.size}px`,
            animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s`,
          }} />
        ))}
      </div>

      {/* Map (always visible) */}
      <div className="map-container">
        <div id="map-container" style={{ height: '100%', width: '100%' }} />
      </div>

      {/* ══════════════════════════════════════════════
          NAVIGATION MODE
      ══════════════════════════════════════════════ */}
      {navActive && step && (
        <>
          {/* Top instruction banner */}
          <div className="nav-banner">
            <div className="nav-icon">{step.icon}</div>
            <div className="nav-instruction-group">
              <div className="nav-instruction">{step.instruction}</div>
              {distToNext !== null && distToNext > 30 && (
                <div className="nav-dist">
                  in {distToNext >= 1000 ? `${(distToNext / 1000).toFixed(1)} km` : `${distToNext} m`}
                </div>
              )}
            </div>
            <button className="nav-stop-btn" onClick={stopNavigation} title="End navigation">✕</button>
          </div>

          {/* Next step preview */}
          {nextStep && (
            <div className="nav-next">
              <span className="nav-next-label">THEN</span>
              <span className="nav-next-icon">{nextStep.icon}</span>
              <span className="nav-next-text">{nextStep.instruction}</span>
            </div>
          )}

          {/* Progress bar */}
          <div className="nav-progress-bar">
            <div className="nav-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          {/* Step counter + manual advance buttons (useful for GPS-denied testing) */}
          <div className="nav-step-counter">
            <button className="nav-manual-btn"
              onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
              disabled={currentStep === 0}>◀</button>
            <span>WAYPOINT {currentStep + 1} / {steps.length}</span>
            <button className="nav-manual-btn"
              onClick={() => currentStep < steps.length - 1
                ? setCurrentStep((s) => s + 1)
                : stopNavigation()
              }>▶</button>
          </div>

          {/* Arrived overlay */}
          {currentStep === steps.length - 1 && (
            <div className="nav-arrived">
              <div className="nav-arrived-icon">🏁</div>
              <div className="nav-arrived-text">YOU HAVE ARRIVED</div>
              <div className="nav-arrived-sub">Destination reached, Commander.</div>
              <button className="engage-btn" style={{ marginTop: 16 }} onClick={stopNavigation}>
                END MISSION
              </button>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════
          SIDEBAR HUD (hidden during navigation)
      ══════════════════════════════════════════════ */}
      {!navActive && (
        <div className="hud-panel">
          <div className="hud-header">
            <div className="hud-logo">
              <span className="rebel-icon">✦</span>
              <div className="hud-title-group">
                <span className="hud-title">GALACTIC COMMUTE</span>
                <span className="hud-subtitle">NAVIGATIONAL SYSTEM v2.0</span>
              </div>
            </div>
            <div className="hud-scanline" />
          </div>

          <div className="input-section">
            <div className="input-label">ORIGIN COORDINATES</div>
            <div className="input-wrapper">
  <span className="input-icon">◈</span>
  <input
    type="text"
    value={start}
    onChange={(e) => setStart(e.target.value)}
    placeholder="Enter origin sector..."
    className="hud-input"
    onKeyDown={(e) => e.key === 'Enter' && fetchRoutes()}
  />
 <button
  className="loc-btn"
  onClick={useCurrentLocation}
  title="Use current location"
>
  <span className="loc-dot"></span>
</button>

</div>

            <button className="swap-btn" onClick={swapLocations} title="Invert trajectory"><span>⇅</span></button>
            <div className="input-label">DESTINATION COORDINATES</div>
            <div className="input-wrapper">
              <span className="input-icon">◉</span>
              <input type="text" value={end} onChange={(e) => setEnd(e.target.value)}
                placeholder="Enter destination sector..." className="hud-input"
                onKeyDown={(e) => e.key === 'Enter' && fetchRoutes()} />
            </div>
          </div>

          <button className="engage-btn" onClick={fetchRoutes} disabled={loading}>
            {loading
              ? <span className="loading-text"><span className="loading-dot" />SCANNING HYPERLANES...</span>
              : 'ENGAGE HYPERDRIVE'}
          </button>

          {error && (
            <div className="error-panel">
              <span className="error-icon">⚠</span><span>{error}</span>
            </div>
          )}

          {routes && (
            <div className="results-section">
              <div className="results-header">— ROUTE INTEL —</div>
              {ROUTE_CONFIGS.map(({ key, label, badge, badgeCls, cls, color }) => {
                const r = routes[key];
                if (!r) return null;
                return (
                  <div key={key} className={`route-card ${cls}`}
                    onClick={() => drawRoute(r.geometry, color)}>
                    <div className={`card-badge ${badgeCls}`}>{badge}</div>
                    <div className="card-title">{label}</div>
                    <div className="card-via">VIA: {r.name}</div>
                    <div className="card-stats">
                      <span>{r.durationMins} min</span>
                      <span>{r.distanceKm} km</span>
                    </div>
                    {r.metrics && (
                      <div className="card-metrics">
                        <div className="metric-item">
                          <span className="metric-label">TEMP</span>
                          <span className="metric-value">{Math.round(r.metrics.tempCelsius)}°C</span>
                        </div>
                        <div className="metric-item">
                          <span className="metric-label">PM2.5</span>
                          <span className="metric-value">{r.metrics.pm25}</span>
                        </div>
                        <div className="metric-item">
                          <span className="metric-label">FORCE</span>
                          <span className="metric-value" style={{ color: getHealthColor(r.healthScore) }}>
                            {r.healthScore}/100
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="force-bar"
                      style={{ '--fill': `${r.healthScore}%`, '--color': getHealthColor(r.healthScore) }}>
                      <div className="force-fill" />
                      <span className="force-label">{getHealthLabel(r.healthScore)}</span>
                    </div>
                    <button className="nav-start-btn"
                      onClick={(e) => { e.stopPropagation(); startNavigation(r); }}>
                      ▶ NAVIGATE THIS ROUTE
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="hud-footer">EMPIRE NAVIGATION CORPS</div>
        </div>
      )}
    </div>
  );
}

export default App;