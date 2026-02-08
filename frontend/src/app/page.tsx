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
        console.error('Router navigation failed:', e);
        window.location.href = '/map';
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 text-4xl font-bold text-sda-accent-cyan">
          SDA Platform
        </div>
        <div className="text-sda-text-secondary">Loading...</div>
      </div>
    </div>
  );
}
