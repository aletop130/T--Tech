/**
 * Centralized Cesium dynamic loader
 * This module handles lazy loading of the Cesium library to reduce initial bundle size
 * and improve compilation speed.
 */

import type * as CesiumType from 'cesium';
import React from 'react';

type CesiumModule = typeof CesiumType;

let cesiumPromise: Promise<CesiumModule> | null = null;
let cesiumModule: CesiumModule | null = null;

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}

/**
 * Initialize Cesium with proper configuration
 * Must be called before using any Cesium functionality
 */
async function initializeCesium(): Promise<CesiumModule> {
  if (typeof window === 'undefined') {
    throw new Error('Cesium can only be initialized in browser environment');
  }

  // Set base URL for Cesium assets
  window.CESIUM_BASE_URL = '/cesium/';

  // Dynamically import Cesium
  const cesium = await import('cesium');
  
  // Configure Cesium
  (cesium.buildModuleUrl as unknown as { setBaseUrl: (url: string) => void }).setBaseUrl('/cesium/');

  if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
    cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  }

  return cesium;
}

/**
 * Get the Cesium module (loads it on first call)
 */
export async function getCesium(): Promise<CesiumModule> {
  if (cesiumModule) {
    return cesiumModule;
  }

  if (!cesiumPromise) {
    cesiumPromise = initializeCesium().then((mod) => {
      cesiumModule = mod;
      return mod;
    });
  }

  return cesiumPromise;
}

/**
 * Check if Cesium is already loaded
 */
export function isCesiumLoaded(): boolean {
  return cesiumModule !== null;
}

/**
 * Get Cesium synchronously (only use after confirming it's loaded)
 */
export function getCesiumSync(): CesiumModule {
  if (!cesiumModule) {
    throw new Error('Cesium not loaded. Call getCesium() first and await it.');
  }
  return cesiumModule;
}

/**
 * Preload Cesium in the background
 * Call this when you know the user will soon need Cesium
 */
export function preloadCesium(): void {
  if (!cesiumPromise && typeof window !== 'undefined') {
    cesiumPromise = initializeCesium().then((mod) => {
      cesiumModule = mod;
      return mod;
    });
  }
}

/**
 * Create a wrapper that handles Cesium initialization for components
 * Usage:
 *   const CesiumComponent = withCesiumLoader(({ Cesium }) => {
 *     // Use Cesium here
 *   });
 */
export function withCesiumLoader<TProps>(
  Component: React.ComponentType<TProps & { Cesium: CesiumModule }>
): React.FC<TProps> {
  return function CesiumLoaderWrapper(props: TProps) {
    const [cesium, setCesium] = React.useState<CesiumModule | null>(null);

    React.useEffect(() => {
      getCesium().then(setCesium);
    }, []);

    if (!cesium) {
      return null; // or loading spinner
    }

    return React.createElement(Component, { ...props, Cesium: cesium });
  };
}

// Re-export types for convenience
export type { CesiumModule };
