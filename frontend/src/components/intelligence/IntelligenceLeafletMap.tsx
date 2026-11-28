'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw } from 'lucide-react';
import type { IntelligenceLeafletMapProps, MapMarkerSpec, MapPolygonSpec, MapPolylineSpec } from './IntelligenceLeafletInner';
export type { IntelligenceLeafletMapProps, MapMarkerSpec, MapPolygonSpec, MapPolylineSpec };

const DynamicLeafletMap = dynamic(() => import('./IntelligenceLeafletInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[380px] rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
      <RefreshCw className="w-5 h-5 animate-spin text-sky-600" />
      <span>Loading Geospatial Risk Canvas...</span>
    </div>
  )
});

export const IntelligenceLeafletMap: React.FC<IntelligenceLeafletMapProps> = (props) => {
  return <DynamicLeafletMap {...props} />;
};
