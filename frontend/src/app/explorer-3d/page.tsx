'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Compass, Globe2 } from 'lucide-react';
import { Hero3DGisView, FlyTo3DTarget } from '../../components/shared/Hero3DGisView';
import { AP_DISTRICTS, getTacticalFacilitiesForDistrict, matchApDistrict } from '../../utils/apDistricts';

export default function FullScreenExplorer3DPage() {
  const router = useRouter();
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [pendingFlyTo, setPendingFlyTo] = useState<FlyTo3DTarget | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const qDist = params.get('district') || '';
    const qLat = parseFloat(params.get('lat') || '');
    const qLng = parseFloat(params.get('lng') || '');
    const qSelect = params.get('select') || '';
    const qFloor = params.get('floor') || 'all';

    if (qDist) {
      setSelectedDistrict(qDist);
    }
    if ((!Number.isNaN(qLat) && !Number.isNaN(qLng)) || qSelect) {
      setPendingFlyTo({
        name: qSelect || qDist || 'Target Structure',
        query: qSelect || undefined,
        lat: !Number.isNaN(qLat) ? qLat : 17.08799,
        lng: !Number.isNaN(qLng) ? qLng : 82.06686,
        floor: qFloor,
        districtName: qDist || undefined
      });
    }
  }, []);

  const matchedDist = matchApDistrict(selectedDistrict);
  const facilities = getTacticalFacilitiesForDistrict(
    matchedDist?.district || selectedDistrict || 'Kakinada',
    matchedDist?.centerLat ?? 17.10364,
    matchedDist?.centerLng ?? 82.25395
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-white overflow-hidden">
      <header className="bg-[#0B1739] border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to HERO
          </button>
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-sky-400" />
            <div>
              <h1 className="text-sm font-black uppercase tracking-wider leading-none">
                HERO 3D GIS &amp; ULPIN Vertical Property Explorer
              </h1>
              <p className="text-[10px] text-slate-300 mt-0.5">
                Andhra Pradesh 28-District Spatial Engine • Floor-by-Floor Tactical Inspection
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-sky-400" />
          <label htmlFor="standalone-ap-district-select" className="text-[10px] font-black uppercase text-slate-300">
            AP District:
          </label>
          <select
            id="standalone-ap-district-select"
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold focus:outline-none focus:border-sky-400 cursor-pointer"
          >
            <option value="">All 28 AP Districts (State View)</option>
            {AP_DISTRICTS.map(d => (
              <option key={d.district} value={d.district}>
                {d.district} ({d.code}) {d.peakTmax != null ? `· ${d.peakTmax}°C` : ''}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 p-2 overflow-hidden">
        <Hero3DGisView
          mode={selectedDistrict ? 'district' : 'state'}
          districtName={matchedDist?.district || selectedDistrict || undefined}
          districtCode={matchedDist?.code}
          centerLat={matchedDist?.centerLat}
          centerLng={matchedDist?.centerLng}
          facilities={facilities}
          pendingFlyTo={pendingFlyTo}
          className="h-full rounded-2xl"
        />
      </main>
    </div>
  );
}
