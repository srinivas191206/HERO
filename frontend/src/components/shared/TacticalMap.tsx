'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { User, Incident } from '../../types';
import { RefreshCw } from 'lucide-react';

interface TacticalMapProps {
  officers?: User[];
  incidents?: Incident[];
  currentOfficerLocation?: { lat: number; lng: number; heading: number; isReal?: boolean } | null;
  districtCenter?: { lat: number; lng: number } | null;
  onDispatchOfficer?: (officerId: string, incidentId: string) => void;
  selectedIncidentId?: string | null;
  onSelectIncident?: (incidentId: string | null) => void;
  onInspectIn3D?: (target: {
    id?: string;
    name: string;
    lat: number;
    lng: number;
    kind: 'station' | 'incident' | 'shelter' | 'landmark' | 'officer';
    description?: string;
    levels?: number;
  }) => void;
  isCommandCenter?: boolean;
}

// Dynamically load the Real Leaflet Map component, disabling SSR so 'window' is available
const LeafletMap = dynamic(
  () => import('./RealLeafletMap'),
  { 
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[300px] bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-400 font-sans text-xs">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
        <span>Synchronizing live Leaflet spatial layers...</span>
      </div>
    )
  }
);

export const TacticalMap: React.FC<TacticalMapProps> = (props) => {
  return <LeafletMap {...props} />;
};
