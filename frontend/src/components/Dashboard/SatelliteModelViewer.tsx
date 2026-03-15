'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';

export function SatelliteModelViewer() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Dynamically import model-viewer to avoid SSR crash (web component)
    import('@google/model-viewer').then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <model-viewer
      src="/models/sentinel-1a.glb"
      alt="Satellite — NASA/Landsat"
      auto-rotate=""
      rotation-per-second="10deg"
      camera-controls=""
      camera-orbit="30deg 70deg auto"
      field-of-view="32deg"
      exposure={2.2}
      shadow-intensity={0.3}
      shadow-softness={0.8}
      environment-image="legacy"
      tone-mapping="commerce"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '300px',
        background: 'transparent',
        // @ts-expect-error model-viewer CSS custom property
        '--poster-color': 'transparent',
      }}
    />
  );
}
