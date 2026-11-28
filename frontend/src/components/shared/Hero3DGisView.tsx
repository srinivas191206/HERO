'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Building2, Globe2, MapPin, Maximize2, Minimize2, ShieldAlert, Siren, Warehouse
} from 'lucide-react';
import { Incident, User } from '../../types';
import { isTrustedSameOriginEvent } from '../../utils/originValidation';
import { AP_DISTRICTS, TacticalFacility3D, matchApDistrict } from '../../utils/apDistricts';

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
  onEntitySelectedFrom3D?: (payload: {
    kind: string;
    name?: string;
    lat?: number;
    lng?: number;
    id?: string;
  }) => void;
  selectedDistrictValue?: string;
  onDistrictSelectChange?: (districtName: string) => void;
  liveTemperatures?: Record<string, number>;
  temperatureText?: string | null;
  isNetworkOnline?: boolean;
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
  selectedDistrictValue,
  onDistrictSelectChange,
  liveTemperatures,
  temperatureText = null,
  isNetworkOnline = true,
  className = ''
}) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [activeShortcutId, setActiveShortcutId] = useState<string>('root');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

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
    return `/gis-3d/viewer.html?${params.toString()}`;
    // Keep initial iframe src stable so switching districts or shortcuts uses postMessage instead of full WebGL reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postTo3DGis = React.useCallback((message: { type: string; payload?: unknown }) => {
    const win = iframeRef.current?.contentWindow;
    if (!win || typeof window === 'undefined' || window.location.origin === 'null') return;
    win.postMessage(message, window.location.origin);
  }, []);

  // Track native browser Fullscreen API state (single fullscreen mechanism shared across UI & viewer)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    if (typeof document === 'undefined') return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (workspaceRef.current?.requestFullscreen) {
        await workspaceRef.current.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedSameOriginEvent(event)) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const { type, payload } = event.data || {};
      if (type === 'HERO_GIS_READY') {
        setIsReady(true);
      } else if (type === 'HERO_3D_ENTITY_SELECTED') {
        if (payload?.name) setSelectedLabel(payload.name);
        if (payload?.id) setActiveShortcutId(String(payload.id));
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

  // Fly camera on state/district change via postMessage without reloading the iframe
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

  // Trigger camera fly-to + vertical inspection when external pendingFlyTo target updates
  useEffect(() => {
    if (!isReady || !pendingFlyTo) return;
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
    setActiveShortcutId(target.id || target.name);
    postTo3DGis({
      type: 'HERO_FLY_TO',
      payload: {
        ...target,
        districtName: target.districtName || districtName,
        inspect: true
      }
    });
  };

  const handleResetDistrictView = () => {
    setSelectedLabel(null);
    setActiveShortcutId('root');
    if (mode === 'state' && !districtName) {
      postTo3DGis({ type: 'HERO_SHOW_STATE_AP', payload: { districts, fly: true } });
    } else {
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
  };

  // Only list incidents with genuine GPS coordinates (never fabricate coords)
  const activeIncidentsWithCoords = incidents.filter(
    i => i.status !== 'Closed' && i.status !== 'Resolved' && i.locationLat != null && i.locationLng != null
  );

  const matchedAp = matchApDistrict(districtName);
  const resolvedLat = centerLat ?? matchedAp?.centerLat;
  const resolvedLng = centerLng ?? matchedAp?.centerLng;
  const liveDistTemp = matchedAp && liveTemperatures ? liveTemperatures[matchedAp.district] : undefined;
  const effectiveTempDisplay =
    temperatureText ??
    (liveDistTemp != null
      ? `${liveDistTemp}°C Live`
      : matchedAp?.peakTmax != null
        ? `Peak ${matchedAp.peakTmax}°C (${matchedAp.peakMandal})`
        : null);

  const activeInspectionName = selectedLabel || pendingFlyTo?.name || null;

  return (
    <div
      ref={workspaceRef}
      className={`relative w-full h-full flex flex-col bg-white border border-slate-200 shadow-xs overflow-hidden ${
        isFullscreen ? 'rounded-none border-0 h-screen w-screen' : 'rounded-2xl'
      } ${className}`}
    >
      {/* Unified Light Context Header */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <Box className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[#0B193D] tracking-tight truncate">
              Andhra Pradesh 3D GIS &amp; UL PIN Explorer
            </h2>
            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
              {districtName ? (
                <>
                  <span>
                    {districtName} ({districtCode || matchedAp?.code || 'AP'})
                  </span>
                  {resolvedLat != null && resolvedLng != null && (
                    <span>
                      {' '}
                      • Lat {resolvedLat.toFixed(4)}° N, Long {resolvedLng.toFixed(4)}° E
                    </span>
                  )}
                  {effectiveTempDisplay && <span> • {effectiveTempDisplay}</span>}
                </>
              ) : (
                <span>
                  All 28 Andhra Pradesh Districts • Statewide Terrain &amp; Vertical Property Engine
                </span>
              )}
              {activeInspectionName && (
                <span className="text-[#0788C9] font-semibold">
                  {' '}
                  • Focus: {activeInspectionName}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right Controls: Live Status, District Selector, Fullscreen Toggle */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
              isNetworkOnline && isReady
                ? 'bg-emerald-50 border-emerald-200 text-[#16A477]'
                : isNetworkOnline
                  ? 'bg-amber-50 border-amber-200 text-[#D99A28]'
                  : 'bg-red-50 border-red-200 text-[#D93636]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isNetworkOnline && isReady
                  ? 'bg-[#16A477] animate-pulse'
                  : isNetworkOnline
                    ? 'bg-[#D99A28]'
                    : 'bg-[#D93636]'
              }`}
            />
            <span>
              {!isNetworkOnline ? 'Offline' : isReady ? 'Live' : 'Initializing...'}
            </span>
          </span>

          {onDistrictSelectChange && (
            <select
              aria-label="Select Andhra Pradesh District for 3D GIS"
              value={selectedDistrictValue ?? ''}
              onChange={(e) => {
                setSelectedLabel(null);
                setActiveShortcutId('root');
                onDistrictSelectChange(e.target.value);
              }}
              className="bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#0B193D] focus:outline-none focus:border-[#0788C9] cursor-pointer max-w-[230px]"
            >
              <option value="">All 28 AP Districts (State View)</option>
              {AP_DISTRICTS.map(d => {
                const temp = liveTemperatures?.[d.district];
                return (
                  <option key={d.district} value={d.district}>
                    {d.district} ({d.code})
                    {temp != null
                      ? ` · ${temp}°C`
                      : d.peakTmax != null
                        ? ` · ${d.peakTmax}°C`
                        : ''}
                  </option>
                );
              })}
            </select>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand 3D GIS Workspace'}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F8FC] text-[#0B193D] transition cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4 text-[#0788C9]" aria-hidden="true" />
                <span className="hidden sm:inline">Exit Fullscreen</span>
              </>
            ) : (
              <Maximize2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Horizontal Location Shortcut Chips Bar */}
      <div
        role="toolbar"
        aria-label="3D GIS Location Shortcuts"
        className="bg-white border-b border-slate-200 px-4 sm:px-5 py-2.5 flex items-center gap-2 overflow-x-auto"
      >
        <button
          type="button"
          onClick={handleResetDistrictView}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wide whitespace-nowrap inline-flex items-center gap-1.5 flex-shrink-0 transition cursor-pointer border ${
            activeShortcutId === 'root'
              ? 'bg-[#0788C9] border-[#0788C9] text-white shadow-xs'
              : 'bg-white border-slate-200 text-[#0B193D] hover:bg-[#F5F8FC]'
          }`}
        >
          {districtName ? (
            <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <Globe2 className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>{districtName ? `${districtName} 3D GIS` : 'AP 28 Districts 3D GIS'}</span>
        </button>

        {/* When in State View, allow direct jump to Kakinada Corridor or provisioned district hubs */}
        {mode === 'state' && !districtName && onDistrictSelectChange && (
          <button
            type="button"
            onClick={() => {
              setSelectedLabel(null);
              setActiveShortcutId('root');
              onDistrictSelectChange('Kakinada');
            }}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 text-xs font-semibold text-[#0B193D] whitespace-nowrap inline-flex items-center gap-1.5 flex-shrink-0 cursor-pointer transition"
          >
            <Building2 className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
            <span>Kakinada 3D GIS</span>
          </button>
        )}

        {mode === 'state' &&
          !districtName &&
          districts.map(dist => (
            <button
              key={dist.id}
              type="button"
              onClick={() => {
                const matched = matchApDistrict(dist.name) || matchApDistrict(dist.code);
                if (onDistrictSelectChange && matched) {
                  setSelectedLabel(null);
                  setActiveShortcutId('root');
                  onDistrictSelectChange(matched.district);
                } else {
                  handleFlyToTarget({
                    id: dist.id,
                    name: dist.name,
                    lat: dist.centerLat,
                    lng: dist.centerLng,
                    kind: 'station',
                    levels: 4,
                    districtName: matched?.district || dist.name
                  });
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 text-xs font-semibold text-[#0B193D] whitespace-nowrap inline-flex items-center gap-1.5 flex-shrink-0 cursor-pointer transition"
            >
              <MapPin className="w-3.5 h-3.5 text-[#D99A28]" aria-hidden="true" />
              <span>{dist.name}</span>
            </button>
          ))}

        {/* Tactical / Landmark Facilities for Active District (e.g. Kakinada Collectorate, T-Hub, Cotton Bhavan, JNTUK Shelter) */}
        {facilities.map(fac => {
          const isActive = activeShortcutId === fac.id;
          return (
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
              title={`Fly 3D camera & inspect ${fac.name}`}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 flex-shrink-0 transition cursor-pointer ${
                isActive
                  ? 'bg-[#EAF2FC] border-[#0788C9] text-[#0B193D] shadow-xs'
                  : 'bg-white border-slate-200 text-[#0B193D] hover:bg-[#F5F8FC]'
              }`}
            >
              {fac.kind === 'station' ? (
                <Building2 className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
              ) : fac.kind === 'shelter' ? (
                <Warehouse className="w-3.5 h-3.5 text-[#16A477]" aria-hidden="true" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-[#D99A28]" aria-hidden="true" />
              )}
              <span>{fac.name}</span>
            </button>
          );
        })}

        {/* Active Geotagged Incidents in View */}
        {activeIncidentsWithCoords.slice(0, 4).map(inc => {
          const isActive = activeShortcutId === inc.id;
          return (
            <button
              key={inc.id}
              type="button"
              onClick={() =>
                handleFlyToTarget({
                  id: inc.id,
                  name: inc.title,
                  lat: inc.locationLat as number,
                  lng: inc.locationLng as number,
                  kind: 'incident',
                  levels: 4,
                  description: inc.description
                })
              }
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 flex-shrink-0 transition cursor-pointer ${
                isActive
                  ? 'bg-red-100 border-[#D93636] text-[#D93636]'
                  : 'bg-red-50/80 border-red-200 text-[#D93636] hover:bg-red-100'
              }`}
            >
              {inc.priority === 'P1' ? (
                <Siren className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
              ) : (
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span className="truncate max-w-[160px]">{inc.title}</span>
            </button>
          );
        })}
      </div>

      {/* Directly Integrated Existing Cesium 3D GIS Engine (100% Preserved) */}
      <div className="relative flex-1 w-full min-h-[500px] bg-slate-950">
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
