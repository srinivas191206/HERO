'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
    } else if (user?.role === 'dispatcher') {
      router.replace('/command');
    } else {
      router.replace('/officer');
    }
  }, [user, isAuthenticated, isLoading, router]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-tactical-black">
      <div className="flex flex-col items-center gap-3">
        {/* Glowing Tactical Telemetry Spinner */}
        <span className="w-8 h-8 rounded-full border-2 border-tactical-cyan/15 border-t-tactical-cyan animate-spin" />
        <span className="font-mono text-xs uppercase tracking-widest text-slate-500">
          Syncing secure telemetry link...
        </span>
      </div>
    </div>
  );
}
