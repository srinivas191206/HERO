'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { User, Incident } from '../../types';
import { Battery, Radio, CheckCircle2, AlertTriangle, MapPin, RadioTower } from 'lucide-react';

interface RealLeafletMapProps {
  officers?: User[];
  incidents?: Incident[];
  currentOfficerLocation?: { lat: number; lng: number; heading: number; isReal?: boolean } | null;
  onDispatchOfficer?: (officerId: string, incidentId: string) => void;
  selectedIncidentId?: string | null;
  onSelectIncident?: (incidentId: string | null) => void;
  isCommandCenter?: boolean;
}

export default function RealLeafletMap({
  officers = [],
  incidents = [],
  currentOfficerLocation = null,
  onDispatchOfficer,
  selectedIncidentId = null,
  onSelectIncident,
  isCommandCenter = false
}: RealLeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasCenteredRef = useRef<boolean>(false);

  // Set selected entity for detail overlay
  const [selectedEntity, setSelectedEntity] = useState<{
    type: 'officer' | 'incident' | 'landmark';
    data: any;
  } | null>(null);

  // Fixed landmarks for tactical context (Moved to Visakhapatnam)
  const landmarks = [
    { name: 'Visakhapatnam Railway Station', lat: 17.7289, lng: 83.2980, type: 'transit', desc: 'Central Transit Hub' },
    { name: 'Command HQ', lat: 17.8167, lng: 83.3426, type: 'hq', desc: 'HQ Base Operations' },
    { name: 'District Police Office', lat: 17.8170, lng: 83.3430, type: 'police', desc: 'Superintendent Office' },
    { name: 'Government General Hospital', lat: 17.7770, lng: 83.3220, type: 'medical', desc: 'Critical Trauma Care Center' },
    { name: 'Coastal Outpost', lat: 17.8200, lng: 83.3500, type: 'hq', desc: 'Coastal Landmark Outpost' },
  ];

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Center of Visakhapatnam Area
    const centerLat = 17.8167;
    const centerLng = 83.3426;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView([centerLat, centerLng], 14);

    // CartoDB Voyager tiles (premium light theme)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);

    // Create a layer group to hold dynamic markers so we can clear/refresh them easily
    const markerGroup = L.layerGroup().addTo(map);
    markerGroupRef.current = markerGroup;
    mapRef.current = map;

    // Add fixed landmarks
    landmarks.forEach(lm => {
      const hqIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute inline-flex h-10 w-10 rounded-full bg-sky-400 opacity-20 animate-ping"></span>
            <div class="w-6 h-6 rounded-lg bg-sky-600 border border-white text-white flex items-center justify-center shadow-md">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path d="M4.75 9.75h14.5m-14.5 4.5h14.5M12 4.75v14.5"/></svg>
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const genericIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="w-4 h-4 rounded-full bg-slate-650 border border-slate-300 shadow-md"></div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const marker = L.marker([lm.lat, lm.lng], {
        icon: lm.type === 'hq' ? hqIcon : genericIcon
      }).addTo(map);

      marker.on('click', () => {
        setSelectedEntity({ type: 'landmark', data: lm });
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Auto center or auto-fit bounds on active entities
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasCenteredRef.current) return;

    const points: L.LatLngExpression[] = [];

    // Add online officers to bounds
    officers.forEach(off => {
      if (off.status !== 'Offline') {
        const offLat = off.location?.latitude || (off as any).lat;
        const offLng = off.location?.longitude || (off as any).lng;
        if (offLat && offLng) {
          points.push([offLat, offLng]);
        }
      }
    });

    // Add dispatcher self location if real
    if (currentOfficerLocation && currentOfficerLocation.isReal) {
      points.push([currentOfficerLocation.lat, currentOfficerLocation.lng]);
    }

    if (points.length > 0) {
      try {
        if (points.length === 1) {
          map.setView(points[0], 14);
        } else {
          const bounds = L.latLngBounds(points);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
        hasCenteredRef.current = true;
      } catch (err) {
        console.warn('Failed to center map bounds:', err);
      }
    }
  }, [officers, currentOfficerLocation]);

  // Update dynamic markers (officers, incidents, own location)
  useEffect(() => {
    const map = mapRef.current;
    const markerGroup = markerGroupRef.current;
    if (!map || !markerGroup) return;

    // Clear previous dynamic markers
    markerGroup.clearLayers();

    // 1. Draw Active Incidents
    incidents.forEach(inc => {
      const indexSeed = parseInt(inc.id.replace(/\D/g, '')) || 0;
      const incLat = inc.locationLat || (inc.reporterId === 'p3' ? 17.8100 : (17.8167 + (indexSeed % 5) * 0.009 - 0.02));
      const incLng = inc.locationLng || (inc.reporterId === 'p3' ? 83.3400 : (83.3426 + (indexSeed % 7) * 0.007 - 0.02));

      const isP1 = inc.priority === 'P1';

      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex items-center justify-center">
            ${isP1 ? '<span class="absolute inline-flex h-12 w-12 rounded-full bg-red-400 opacity-35 animate-ping"></span>' : ''}
            <div class="flex items-center justify-center w-6 h-6 rounded-lg ${isP1 ? 'bg-red-500' : 'bg-amber-500'} text-white shadow-lg border border-white">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([incLat, incLng], { icon }).addTo(markerGroup);
      marker.on('click', () => {
        setSelectedEntity({ type: 'incident', data: { ...inc, lat: incLat, lng: incLng } });
        if (onSelectIncident) {
          onSelectIncident(inc.id);
        }
      });
    });

    // 2. Draw Deployed Officers
    officers.forEach(off => {
      const seed = parseInt(off.badgeNumber.replace(/\D/g, '')) || 1;
      const offLat = off.location?.latitude || (off as any).lat || (17.8200 + (seed % 4) * 0.009 - 0.015);
      const offLng = off.location?.longitude || (off as any).lng || (83.3400 + (seed % 6) * 0.009 - 0.025);

      const isOnline = off.status !== 'Offline';
      const isEmergency = off.status === 'Emergency';

      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex flex-col items-center justify-center">
            ${isEmergency ? '<span class="absolute inline-flex h-10 w-10 rounded-full bg-red-400 opacity-60 animate-ping"></span>' : ''}
            <div class="w-5 h-5 rounded-full ${isEmergency ? 'bg-red-500' : isOnline ? 'bg-emerald-500' : 'bg-slate-400'} border-2 border-white shadow-md flex items-center justify-center">
              <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
            </div>
            <div class="mt-1 px-1 bg-slate-950/80 rounded border border-slate-800 text-[8px] text-white font-bold font-sans tracking-tight whitespace-nowrap shadow">
              ${off.name.split(' ')[1] || off.name}
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const marker = L.marker([offLat, offLng], { icon }).addTo(markerGroup);
      marker.on('click', () => {
        setSelectedEntity({ type: 'officer', data: { ...off, lat: offLat, lng: offLng } });
      });
    });

    // 3. Draw Self Position (Pulsing blue marker)
    if (currentOfficerLocation) {
      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `
          <div class="relative flex items-center justify-center">
            <span class="absolute inline-flex h-10 w-10 rounded-full bg-sky-400 opacity-50 animate-ping"></span>
            <div class="w-5 h-5 rounded-full bg-sky-600 border-2 border-white shadow-md flex items-center justify-center">
              <svg class="w-2.5 h-2.5 text-white transform rotate-${currentOfficerLocation.heading || 0}" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([currentOfficerLocation.lat, currentOfficerLocation.lng], { icon }).addTo(markerGroup);
      marker.on('click', () => {
        setSelectedEntity({ 
          type: 'officer', 
          data: { 
            name: 'YOU (Patrol Node)', 
            badgeNumber: 'Local Client', 
            status: 'Online', 
            battery: 100, 
            lat: currentOfficerLocation.lat, 
            lng: currentOfficerLocation.lng 
          } 
        });
      });
    }

  }, [officers, incidents, currentOfficerLocation]);

  return (
    <div className="relative w-full h-full bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {/* Dynamic details overlay card */}
      {selectedEntity && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 border border-slate-200 text-slate-800 rounded-2xl shadow-2xl p-4 w-72 max-w-[calc(100vw-32px)] font-mono text-xs flex flex-col justify-between gap-3 animate-fadeIn backdrop-blur-md">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-2">
            <div>
              <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block">
                {selectedEntity.type} Information
              </span>
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate mt-0.5 font-sans">
                {selectedEntity.type === 'officer' && selectedEntity.data.name}
                {selectedEntity.type === 'incident' && selectedEntity.data.title}
                {selectedEntity.type === 'landmark' && selectedEntity.data.name}
              </h4>
            </div>
            <button 
              onClick={() => setSelectedEntity(null)}
              className="text-slate-400 hover:text-slate-800 p-1 hover:bg-slate-100 rounded transition font-sans font-bold"
            >
              ✕
            </button>
          </div>

          {/* Details body */}
          <div className="space-y-1.5 text-slate-600">
            {selectedEntity.type === 'officer' && (
              <>
                <div className="flex justify-between">
                  <span>BADGE ID:</span>
                  <span className="text-sky-400 font-bold">{selectedEntity.data.badgeNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>STATUS:</span>
                  <span className={`font-bold ${
                    selectedEntity.data.status === 'Emergency' 
                      ? 'text-red-500 animate-pulse' 
                      : selectedEntity.data.status === 'Offline' 
                        ? 'text-slate-500' 
                        : 'text-emerald-600'
                  }`}>{selectedEntity.data.status}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>BATTERY:</span>
                  <span className="flex items-center gap-1 font-sans">
                    <span className="font-bold font-mono">{selectedEntity.data.battery}%</span>
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 border-t border-slate-200 pt-1.5">
                  <span>LAT / LNG:</span>
                  <span>{selectedEntity.data.lat?.toFixed(5)}, {selectedEntity.data.lng?.toFixed(5)}</span>
                </div>
              </>
            )}

            {selectedEntity.type === 'incident' && (
              <>
                <div className="flex justify-between">
                  <span>PRIORITY:</span>
                  <span className={`px-1.5 py-0.5 rounded-sm font-bold text-[10px] ${
                    selectedEntity.data.priority === 'P1' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}>
                    {selectedEntity.data.priority}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>OPERATIONAL STATE:</span>
                  <span className="text-sky-600 font-bold uppercase">{selectedEntity.data.status}</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed italic bg-slate-50 p-2 rounded border border-slate-200 mt-1 font-sans">
                  "{selectedEntity.data.description}"
                </p>
                <div className="flex justify-between text-[10px] text-slate-400 border-t border-slate-200 pt-1.5">
                  <span>REPORTER:</span>
                  <span>{selectedEntity.data.reporterId}</span>
                </div>
              </>
            )}

            {selectedEntity.type === 'landmark' && (
              <>
                <p className="text-[11px] leading-relaxed text-slate-400 font-sans">
                  {selectedEntity.data.desc}
                </p>
                <div className="flex justify-between text-[10px] text-slate-400 border-t border-slate-200 pt-1.5">
                  <span>GPS POSITION:</span>
                  <span>{selectedEntity.data.lat.toFixed(4)} N, {selectedEntity.data.lng.toFixed(4)} E</span>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-slate-200 pt-3 flex gap-2 font-sans font-bold">
            {selectedEntity.type === 'officer' && (
              <>
                <button 
                  onClick={() => alert(`Initiating secure voice PTT link to officer ${selectedEntity.data.name}`)}
                  className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-[10px] text-white font-bold rounded-lg border border-sky-400/20 flex items-center justify-center gap-1 cursor-pointer transition"
                >
                  PTT COMM
                </button>
                {isCommandCenter && selectedIncidentId && onDispatchOfficer && (
                  <button 
                    onClick={() => {
                      onDispatchOfficer(selectedEntity.data.id, selectedIncidentId);
                      setSelectedEntity(null);
                    }}
                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-[10px] text-white font-bold rounded-lg border border-emerald-400/20 flex items-center justify-center gap-1 cursor-pointer transition"
                  >
                    DISPATCH
                  </button>
                )}
              </>
            )}

            {selectedEntity.type === 'incident' && isCommandCenter && (
              <button 
                onClick={() => alert(`Broadcasting P1 incident alert response to team Alpha/Command...`)}
                className="w-full py-1.5 bg-red-600 hover:bg-red-500 active:scale-95 text-[10px] text-white font-bold rounded-lg border border-red-400/20 flex items-center justify-center gap-1 cursor-pointer transition"
              >
                BROADCAST ALARM
              </button>
            )}

            {selectedEntity.type === 'landmark' && (
              <button 
                onClick={() => alert(`Marking landmark as reference checkpoint...`)}
                className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-[10px] text-slate-700 font-bold rounded-lg border border-slate-300 flex items-center justify-center gap-1 cursor-pointer transition"
              >
                SET CHECKPOINT
              </button>
            )}
          </div>
        </div>
      )}

      {/* Map DOM anchor node */}
      <div ref={mapContainerRef} className="flex-1 w-full h-full bg-slate-100 z-0" />

      {/* Recenter GPS Button */}
      {currentOfficerLocation && (
        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.setView([currentOfficerLocation.lat, currentOfficerLocation.lng], 14);
            }
          }}
          className="absolute top-4 right-4 z-[1000] p-2 bg-white/95 hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl shadow-lg active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5 text-[10px] font-extrabold uppercase font-sans tracking-wide"
          title="Recenter Map on My Location"
        >
          <MapPin className="w-3.5 h-3.5 text-sky-600 animate-pulse" />
          <span>My Location</span>
        </button>
      )}
    </div>
  );
}
