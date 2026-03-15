'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        router.push('/map');
      } catch (e) {
        console.warn('Router navigation failed:', e);
        window.location.href = '/map';
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-sda-bg-primary">
      <div className="text-center flex flex-col items-center">
        <img
          src="/omniscient-logo.svg"
          alt="Horus logo"
          className="h-24 w-24 mb-6 animate-pulse"
        />
        <div className="mb-4 text-4xl font-bold text-sda-accent-cyan">
          Horus
        </div>
        <div className="text-sda-text-secondary">Loading...</div>
      </div>
    </div>
  );
}
