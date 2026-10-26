import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { coordinatesFromLatLng } from '../../utils/complaintLocation';

// OpenStreetMap tiles need no API key. Their usage policy requires attribution.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

const WORLD_VIEW = { center: [20, 0], zoom: 2 };
const PIN_ZOOM = 16;

// Colors match the ResolveNet primary tokens in styles/tokens.css. Leaflet
// draws on canvas or SVG, so it cannot read CSS variables.
const PIN_STYLE = {
  radius: 8,
  color: '#ffffff',
  weight: 2,
  fillColor: '#1b4b7a',
  fillOpacity: 1,
};

// Click-to-pick map for the complaint location. The map is created once and kept
// in a ref. The selected point is mirrored onto a single marker whenever
// `coordinates` changes, so the parent stays the source of truth.
export function IssueLocationPicker({ coordinates, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const map = L.map(containerRef.current, {
      ...WORLD_VIEW,
      // Stops the page from zooming when the citizen scrolls past the map.
      scrollWheelZoom: false,
    });

    const tiles = L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 });
    tiles.on('tileerror', () => setTilesFailed(true));
    tiles.addTo(map);

    map.on('click', (event) => onSelectRef.current(coordinatesFromLatLng(event.latlng)));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!coordinates) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const point = [coordinates.latitude, coordinates.longitude];
    if (markerRef.current) {
      markerRef.current.setLatLng(point);
      // Pan only when the point has moved out of view, so a click near the edge
      // does not jump the map.
      if (!map.getBounds().contains(point)) map.panTo(point);
    } else {
      markerRef.current = L.circleMarker(point, PIN_STYLE).addTo(map);
      map.setView(point, Math.max(map.getZoom(), PIN_ZOOM));
    }
  }, [coordinates]);

  return (
    <div className="rn-location-picker">
      <div
        ref={containerRef}
        className="rn-location-picker__map"
        role="region"
        aria-label="Map. Click to pin where the issue is."
      />
      {tilesFailed && (
        <p className="rn-location-picker__notice" role="status">
          The map background could not load. You can still click to pin the spot, use your current location, or type an
          address.
        </p>
      )}
    </div>
  );
}
