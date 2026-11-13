import { Component, type ReactNode } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, Polyline, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL, isValidLatLng } from '@/lib/mapProvider';

/**
 * M7 modular map. CircleMarkers (no image assets → no broken-icon problem).
 * Tones distinguish roles on the dark canvas: azure = customer/you (electric
 * purple), aqua = mechanic (teal), neutral = other.
 *
 * Every coordinate prop is sanitized before reaching Leaflet: Firestore
 * documents are not trusted for map purposes, so missing/non-finite/
 * out-of-range values are dropped (or fall back to the default center)
 * instead of rendering NaN geometry.
 */

export interface MapPin {
  id: string;
  position: [number, number];
  label?: string;
  tone?: 'azure' | 'aqua' | 'neutral';
}

interface MapViewProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  userPosition?: [number, number] | null;
  userLabel?: string;
  mechanicMarkers?: MapPin[];
  line?: [number, number][] | null;
  /** Optional click handler for pin-selection mode. Receives [lat, lng]. */
  onPinClick?: (position: [number, number]) => void;
}

const TONE: Record<NonNullable<MapPin['tone']>, { color: string; fill: string }> = {
  azure: { color: '#A855F7', fill: '#A855F7' },
  aqua: { color: '#2DD4BF', fill: '#2DD4BF' },
  neutral: { color: '#A1A1AA', fill: '#A1A1AA' },
};

type SanitizedMapProps = Omit<MapViewProps, 'center' | 'userPosition' | 'mechanicMarkers' | 'line'> & {
  center: [number, number];
  userPosition: [number, number] | null;
  mechanicMarkers: MapPin[];
  line: [number, number][];
  onPinClick?: (position: [number, number]) => void;
}

function sanitizeMapProps(props: MapViewProps): SanitizedMapProps {
  const center = props.center && isValidLatLng(props.center[0], props.center[1]) ? props.center : DEFAULT_CENTER;
  const userPosition = props.userPosition && isValidLatLng(props.userPosition[0], props.userPosition[1]) ? props.userPosition : null;
  const mechanicMarkers = (props.mechanicMarkers ?? []).filter((m) => isValidLatLng(m.position[0], m.position[1]));
  const line: [number, number][] = (props.line ?? []).filter((pt) => isValidLatLng(pt[0], pt[1]));
  return { center, userPosition, mechanicMarkers, line, zoom: props.zoom, className: props.className, userLabel: props.userLabel, onPinClick: props.onPinClick };
}

function MapClicker(props: { onPinClick: (position: [number, number]) => void }) {
  useMapEvents({
    click: (e) => props.onPinClick([e.latlng.lat, e.latlng.lng]),
  });
  return null;
}

function InnerMap(props: MapViewProps) {
  const { center, zoom = DEFAULT_ZOOM, className, userPosition, userLabel, mechanicMarkers, line, onPinClick } = sanitizeMapProps(props);
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom className={className ?? 'aspect-[16/10] w-full rounded-xl'} attributionControl>
      {onPinClick && <MapClicker onPinClick={onPinClick} />}
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      {userPosition && (
        <CircleMarker center={userPosition} radius={10} pathOptions={{ color: TONE.azure.color, fillColor: TONE.azure.fill, fillOpacity: 0.85, weight: 3 }}>
          {userLabel && <Tooltip permanent direction="top">{userLabel}</Tooltip>}
        </CircleMarker>
      )}
      {mechanicMarkers.map((m) => {
        const t = TONE[m.tone ?? 'aqua'];
        return (
          <CircleMarker key={m.id} center={m.position} radius={8} pathOptions={{ color: t.color, fillColor: t.fill, fillOpacity: 0.8, weight: 2 }}>
            {m.label && <Tooltip direction="top">{m.label}</Tooltip>}
          </CircleMarker>
        );
      })}
      {line.length >= 2 && <Polyline positions={line} pathOptions={{ color: '#A855F7', weight: 3, dashArray: '8 6' }} />}
      {onPinClick && <Marker position={center}><Popup>Click map to select your location</Popup></Marker>}
    </MapContainer>
  );
}

function MapFallback({ reason }: { reason: string }) {
  return (
    <div className="map-grid grid aspect-[16/10] w-full place-items-center rounded-xl border border-line-soft bg-graphite-card" role="status">
      <div className="px-6 text-center">
        <p className="font-semibold text-cream">Map unavailable</p>
        <p className="mt-1 max-w-sm text-sm text-steel-300">{reason}</p>
      </div>
    </div>
  );
}

class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; reason: string }> {
  state = { failed: false, reason: '' };

  static getDerivedStateFromError(err: unknown) {
    return { failed: true, reason: err instanceof Error ? err.message : 'Map failed to load.' };
  }

  render() {
    if (this.state.failed) return <MapFallback reason={this.state.reason} />;
    return this.props.children;
  }
}

export function MapView(props: MapViewProps) {
  if (typeof window === 'undefined') return <MapFallback reason="Map needs a browser." />;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return <MapFallback reason="You are offline. Coordinates below still apply — reconnect for tiles." />;
  }
  return (
    <MapErrorBoundary>
      <InnerMap {...props} />
    </MapErrorBoundary>
  );
}
