import { Component, type ReactNode } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '@/lib/mapProvider';

/**
 * M7 modular map. CircleMarkers (no image assets → no broken-icon problem).
 * Tones distinguish roles: azure = customer/you, aqua = mechanic.
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
}

const TONE: Record<NonNullable<MapPin['tone']>, { color: string; fill: string }> = {
  azure: { color: '#3b7dff', fill: '#3b7dff' },
  aqua: { color: '#14b8a6', fill: '#14b8a6' },
  neutral: { color: '#8a919c', fill: '#8a919c' },
};

function InnerMap({ center = DEFAULT_CENTER, zoom = DEFAULT_ZOOM, className, userPosition, userLabel, mechanicMarkers = [], line }: MapViewProps) {
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom className={className ?? 'aspect-[16/10] w-full rounded-xl'} attributionControl>
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
      {line && line.length >= 2 && <Polyline positions={line} pathOptions={{ color: '#f94e10', weight: 3, dashArray: '8 6' }} />}
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
