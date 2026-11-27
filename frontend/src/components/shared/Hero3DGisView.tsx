'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Building2, Compass, Layers, MapPin, ShieldAlert, Siren, Warehouse } from 'lucide-react';
import { Incident, User } from '../../types';
import { isTrustedSameOriginEvent } from '../../utils/originValidation';
import { TacticalFacility3D } from '../../utils/apDistricts';

export interface FlyTo3DTarget {
  id?: string;
  name: string;
  query?: string;
  lat: number;
  lng: number;
  kind?: 'station' | 'incident' | 'shelter' | 'officer' | 'facility' | 'landmark';
  levels?: number;
  floor?: string;
  districtName?: string;
  description?: string;
  altitude?: number;
}

interface Hero3DGisViewProps {
  mode: 'state' | 'district';
  districtName?: string;
  districtCode?: string;
  centerLat?: number;
  centerLng?: number;
  districts?: Array<{
    id: string;
    name: string;
    code: string;
    centerLat: number;
    centerLng: number;
    sosCount?: number;
  }>;
  officers?: User[];
  incidents?: Incident[];
  facilities?: TacticalFacility3D[];
  pendingFlyTo?: FlyTo3DTarget | null;
  onEntitySelectedFrom3D?: (payload: { kind: string; name?: string; lat?: number; lng?: number; id?: string }) => void;
  className?: string;
}

export const Hero3DGisView: React.FC<Hero3DGisViewProps> = ({
  mode,
  districtName,
  districtCode,
  centerLat,
  centerLng,
  districts = [],
  officers = [],
  incidents = [],
  facilities = [],
  pendingFlyTo = null,
  onEntitySelectedFrom3D,
  className = ''
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [activeFloor, setActiveFloor] = useState<string>('all');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const initialSrc = React.useMemo(() => {
    const params = new URLSearchParams();
    if (mode === 'state') {
      params.set('mode', 'state');
    } else if (districtName) {
      params.set('district', districtName);
      if (centerLat != null && centerLng != null) {
        params.set('lat', String(centerLat));
        params.set('lng', String(centerLng));
      }
    }
    return `/gis-3d/index.html?${params.toString()}`;
    // Keep initial iframe src stable so switching districts uses postMessage instead of full WebGL reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postTo3DGis = React.useCallback((message: { type: string; payload?: unknown }) => {
    const win = iframeRef.current?.contentWindow;
    if (!win || typeof window === 'undefined' || window.location.origin === 'null') return;
    win.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedSameOriginEvent(event)) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const { type, payload } = event.data || {};
      if (type === 'HERO_GIS_READY') {
        setIsReady(true);
      } else if (type === 'HERO_3D_ENTITY_SELECTED') {
        if (payload?.name) setSelectedLabel(payload.name);
        onEntitySelectedFrom3D?.(payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onEntitySelectedFrom3D]);

  // Sync districts, officers, incidents, stations, and shelters whenever data or readiness updates
  useEffect(() => {
    if (!isReady) return;
    const stations = facilities.filter(f => f.kind === 'station');
    const shelters = facilities.filter(f => f.kind === 'shelter');

    postTo3DGis({
      type: 'HERO_SYNC_ENTITIES',
      payload: {
        mode,
        district: districtName ? { name: districtName, code: districtCode, centerLat, centerLng } : undefined,
        districts,
        officers,
        incidents: incidents.map(i => ({ ...i, districtName })),
        stations: stations.map(s => ({ ...s, districtName })),
        shelters: shelters.map(sh => ({ ...sh, districtName }))
      }
    });
  }, [isReady, mode, districtName, districtCode, centerLat, centerLng, districts, officers, incidents, facilities, postTo3DGis]);

  // Fly camera on state/district change
  useEffect(() => {
    if (!isReady) return;
    if (mode === 'state' && !districtName) {
      postTo3DGis({
        type: 'HERO_SHOW_STATE_AP',
        payload: { districts, fly: true }
      });
    } else if (districtName || (centerLat != null && centerLng != null)) {
      postTo3DGis({
        type: 'HERO_SELECT_DISTRICT',
        payload: {
          name: districtName,
          code: districtCode,
          lat: centerLat,
          lng: centerLng,
          altitude: 28000
        }
      });
    }
  }, [isReady, mode, districtName, districtCode, centerLat, centerLng, postTo3DGis, districts]);

  // Trigger camera fly-to + floor-by-floor inspection when HERO target changes
  useEffect(() => {
    if (!isReady || !pendingFlyTo) return;
    setSelectedLabel(pendingFlyTo.name);
    setActiveFloor(pendingFlyTo.floor || 'all');
    postTo3DGis({
      type: 'HERO_FLY_TO',
      payload: {
        ...pendingFlyTo,
        inspect: true
      }
    });
  }, [isReady, pendingFlyTo, postTo3DGis]);

  const handleFlyToTarget = (target: FlyTo3DTarget) => {
    setSelectedLabel(target.name);
    setActiveFloor(target.floor || 'all');
    postTo3DGis({
      type: 'HERO_FLY_TO',
      payload: {
        ...target,
        districtName: target.districtName || districtName,
        inspect: true
      }
    });
  };

  const handleFloorChange = (floor: string) => {
    setActiveFloor(floor);
    postTo3DGis({
      type: 'HERO_SET_FLOOR',
      payload: { floor }
    });
  };

  const activeIncidentsWithCoords = incidents.filter(
    i => i.status !== 'Closed' && (i.locationLat != null || centerLat != null)
  );

  return (
    <div className={`relative w-full h-full flex flex-col rounded-3xl overflow-hidden border border-slate-200 bg-slate-950 shadow-xl ${className}`}>
      {/* Tactical Quick-Dispatch 3D Control Ribbon */}
      <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 font-black text-[10px] uppercase">
            <Compass className="w-3.5 h-3.5" />
            {districtName ? `${districtName} 3D GIS` : 'Andhra Pradesh 3D GIS'}
          </span>

          {mode === 'state' && (
            <button
              type="button"
              onClick={() => {
                setSelectedLabel(null);
                postTo3DGis({ type: 'HERO_SHOW_STATE_AP', payload: { districts, fly: true } });
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-700 text-slate-200 text-[10px] font-bold uppercase transition cursor-pointer"
            >
              AP All 28 Districts
            </button>
          )}

          {facilities.map(fac => (
            <button
              key={fac.id}
              type="button"
              onClick={() =>
                handleFlyToTarget({
                  id: fac.id,
                  name: fac.name,
                  query: fac.query,
                  lat: fac.lat,
                  lng: fac.lng,
                  kind: fac.kind,
                  levels: fac.levels,
                  description: fac.desc
                })
              }
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600/80 border border-slate-700 text-[10px] font-bold text-slate-200 flex items-center gap-1 transition cursor-pointer"
              title={`Fly 3D camera & inspect ${fac.name}`}
            >
              {fac.kind === 'station' ? (
                <Building2 className="w-3 h-3 text-sky-400" />
              ) : fac.kind === 'shelter' ? (
                <Warehouse className="w-3 h-3 text-emerald-400" />
              ) : (
                <MapPin className="w-3 h-3 text-amber-400" />
              )}
              <span className="truncate max-w-[150px]">{fac.name}</span>
            </button>
          ))}

          {activeIncidentsWithCoords.slice(0, 3).map((inc, idx) => {
            const incLat = inc.locationLat ?? ((centerLat ?? 17.0146) + idx * 0.002);
            const incLng = inc.locationLng ?? ((centerLng ?? 81.1826) + idx * 0.002);
            return (
              <button
                key={inc.id}
                type="button"
                onClick={() =>
                  handleFlyToTarget({
                    id: inc.id,
                    name: inc.title,
                    lat: incLat,
                    lng: incLng,
                    kind: 'incident',
                    levels: 4,
                    description: inc.description
                  })
                }
                className="px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-700 border border-red-500/40 text-[10px] font-black text-red-200 flex items-center gap-1 transition cursor-pointer"
              >
                {inc.priority === 'P1' ? <Siren className="w-3 h-3 text-red-400 animate-pulse" /> : <ShieldAlert className="w-3 h-3 text-amber-400" />}
                <span className="truncate max-w-[140px]">{inc.title}</span>
              </button>
            );
          })}
        </div>

        {/* Floor-by-Floor Quick Slice Controls synced with 3D Explorer */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-black text-slate-400 uppercase mr-1 flex items-center gap-1">
            <Layers className="w-3 h-3" />
            Floor:
          </span>
          {['B1', 'G', '1', '2', '3', '4', 'all'].map(lvl => (
            <button
              key={lvl}
              type="button"
              onClick={() => handleFloorChange(lvl)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase transition cursor-pointer ${
                activeFloor === lvl
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {selectedLabel && (
        <div className="bg-sky-950/90 border-b border-sky-800/70 px-4 py-1.5 text-[11px] font-bold text-sky-200 flex items-center justify-between">
          <span>3D Vertical Inspection Active: {selectedLabel} (Level: {activeFloor})</span>
          <span className="text-[10px] font-mono text-sky-400">{isReady ? 'POSTMESSAGE SYNC ACTIVE' : 'INITIALIZING...'}</span>
        </div>
      )}

      {/* Embedded Cesium 3D GIS Explorer */}
      <div className="relative flex-1 w-full min-h-[540px]">
        <iframe
          ref={iframeRef}
          src={initialSrc}
          title="HERO 3D GIS & ULPIN Vertical Property Explorer"
          className="w-full h-full border-0 block"
          allow="fullscreen; geolocation"
        />
      </div>
    </div>
  );
};
