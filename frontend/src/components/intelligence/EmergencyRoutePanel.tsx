'use client';

import React from 'react';
import {
  AlertTriangle,
  MapPin,
  Navigation,
  ShieldCheck,
  Truck
} from 'lucide-react';
import { Incident } from '../../types';
import { EvaluatedUrbanSegment } from './StreetDrainageFeedPanel';

interface EmergencyRoutePanelProps {
  hubCity: string;
  segments: EvaluatedUrbanSegment[];
  focusSegment: EvaluatedUrbanSegment;
  selectedRouteId: string | null;
  onSelectRoute: (segment: EvaluatedUrbanSegment) => void;
  corridorIncidents: Incident[];
}

export const EmergencyRoutePanel: React.FC<EmergencyRoutePanelProps> = ({
  hubCity,
  segments,
  focusSegment,
  selectedRouteId,
  onSelectRoute,
  corridorIncidents
}) => {
  const blockedOrFocused =
    focusSegment || segments.find(s => s.isFlooded) || segments[0];

  const passableAlternatives = segments.filter(s => !s.isFlooded && s.id !== blockedOrFocused?.id);
  const allPassable = segments.filter(s => !s.isFlooded);

  const recommendedRoutes = passableAlternatives.length > 0 ? passableAlternatives : allPassable;

  return (
    <section
      aria-label="Emergency Route Intelligence"
      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <Navigation className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-[#0B193D] tracking-tight truncate">
              Emergency Route Intelligence
            </h2>
            <p className="text-[11px] font-medium text-slate-500 truncate">
              Passable corridor evaluation for {hubCity}
            </p>
          </div>
        </div>
        {corridorIncidents.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[#D93636] text-[10px] font-bold flex-shrink-0">
            {corridorIncidents.length} Active Incident(s)
          </span>
        )}
      </div>

      {/* Selected Incident / Blocked Location */}
      {blockedOrFocused && (
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
            blockedOrFocused.isFlooded
              ? 'bg-[#FFF3F3] border-[#F8CCCC]'
              : 'bg-[#F5F8FC] border-slate-200'
          }`}
        >
          <div className="flex items-start gap-2 min-w-0">
            <MapPin
              className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                blockedOrFocused.isFlooded ? 'text-[#D93636]' : 'text-[#0788C9]'
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                Evaluated Location
              </span>
              <span className="text-xs font-extrabold text-[#0B193D] block truncate">
                {blockedOrFocused.name}
              </span>
              <span className="text-[10px] font-mono text-slate-500 block">
                {blockedOrFocused.lat.toFixed(4)}, {blockedOrFocused.lng.toFixed(4)}
              </span>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold uppercase flex-shrink-0 ${
              blockedOrFocused.isFlooded
                ? 'bg-[#D93636] text-white'
                : blockedOrFocused.status === 'CAUTION'
                  ? 'bg-[#D99A28] text-white'
                  : 'bg-[#16A477] text-white'
            }`}
          >
            {blockedOrFocused.status}
          </span>
        </div>
      )}

      {/* Recommended Corridors */}
      <div className="space-y-2 flex-1">
        <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-600">
          <span>Available Corridor Segments</span>
          <span className="text-[9.5px] font-semibold text-slate-400">
            Turn-by-turn ETA engine N/A
          </span>
        </div>

        {recommendedRoutes.length === 0 ? (
          <div className="p-3 rounded-xl bg-[#FFF3F3] border border-[#F8CCCC] text-xs text-[#991B1B] font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#D93636] flex-shrink-0" aria-hidden="true" />
            <span>No passable corridor segments remain at current scenario depth.</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recommendedRoutes.map(route => {
              const isChosen = selectedRouteId === route.id;
              const isVerifiedSpine = route.role === 'safe_evac' && route.status === 'OPEN';
              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => onSelectRoute(route)}
                  className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                    isChosen
                      ? 'bg-[#EEF7FC] border-[#0788C9] ring-1 ring-[#0788C9]/30'
                      : 'bg-[#F5F8FC] border-slate-200 hover:border-[#0788C9]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck
                        className={`w-3.5 h-3.5 flex-shrink-0 ${
                          isVerifiedSpine ? 'text-[#16A477]' : 'text-[#D99A28]'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-xs font-bold text-[#0B193D] truncate">{route.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Truck className="w-3 h-3" aria-hidden="true" />
                        {route.role === 'safe_evac'
                          ? 'Elevated spine (Emergency vehicles)'
                          : 'Bund/drain corridor (Verify clearance)'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[8.5px] font-extrabold uppercase block ${
                        isVerifiedSpine
                          ? 'bg-emerald-100 text-[#16A477]'
                          : 'bg-amber-100 text-[#B45309]'
                      }`}
                    >
                      {isVerifiedSpine ? 'Verified' : 'Verify Alt'}
                    </span>
                    <span className="text-[10.5px] font-mono font-bold text-[#0B193D] mt-0.5 block">
                      {route.lengthKm.toFixed(1)} km span
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {recommendedRoutes[0] && (
        <button
          type="button"
          onClick={() => onSelectRoute(recommendedRoutes[0])}
          className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] text-xs font-bold text-[#0B193D] inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Navigation className="w-3.5 h-3.5 text-[#0788C9]" aria-hidden="true" />
          <span>Focus Best Available Route on Map</span>
        </button>
      )}
    </section>
  );
};
