'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Viewer, useCesium } from 'resium';
import * as Cesium from 'cesium';

// Configure Cesium to use local assets - MUST be done before any Cesium usage
if (typeof window !== 'undefined') {
  // Set the base URL for Cesium assets
  window.CESIUM_BASE_URL = '/cesium/';
  Cesium.buildModuleUrl.setBaseUrl('/cesium/');
  
  // Set default Ion token if available
  if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
    Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  }
}

interface CesiumViewerProps {
  className?: string;
  onViewerReady?: (viewer: Cesium.Viewer) => void;
}

// Internal component to access viewer via hook
function ViewerConfig({ onViewerReady }: { onViewerReady?: (viewer: Cesium.Viewer) => void }) {
  const { viewer } = useCesium();
  const isConfiguredRef = useRef(false);

  useEffect(() => {
    if (viewer && !isConfiguredRef.current) {
      console.log('Cesium Viewer ready, configuring...');
      
      // Configure dark theme
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.dynamicAtmosphereLighting = true;
      viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
      
      // Ensure globe is visible
      viewer.scene.globe.show = true;
      viewer.scene.globe.depthTestAgainstTerrain = false;
      
      // Set scene background
      viewer.scene.backgroundColor = Cesium.Color.BLACK;
      
      // Enable sky atmosphere
      viewer.scene.skyAtmosphere.show = true;
      
      // Configure SkyBox with local assets
      viewer.scene.skyBox = new Cesium.SkyBox({
        sources: {
          positiveX: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
          negativeX: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
          positiveY: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
          negativeY: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
          positiveZ: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
          negativeZ: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg'
        }
      });
      viewer.scene.skyBox.show = true;
      
      // Configure imagery - use OpenStreetMap
      try {
        // Remove default layers
        viewer.imageryLayers.removeAll();
        
        // Add OpenStreetMap imagery
        const osmProvider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          subdomains: ['a', 'b', 'c'],
          maximumLevel: 19,
          credit: new Cesium.Credit('© OpenStreetMap contributors')
        });
        
        viewer.imageryLayers.addImageryProvider(osmProvider);
        console.log('OpenStreetMap imagery provider added');
      } catch (error) {
        console.error('Error configuring imagery:', error);
      }
      
      // Set initial camera position - view Earth from space
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
        orientation: {
          heading: 0.0,
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0.0
        }
      });

      console.log('Cesium Viewer configured successfully');
      isConfiguredRef.current = true;
      
      if (onViewerReady) {
        onViewerReady(viewer);
      }
    }
  }, [viewer, onViewerReady]);

  return null;
}

export function CesiumViewer({ className, onViewerReady }: CesiumViewerProps) {
  const creditContainerRef = useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof document !== 'undefined' && !creditContainerRef.current) {
      creditContainerRef.current = document.createElement('div');
    }
  }, []);

  if (!isMounted) {
    return (
      <div className={className} style={{ width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fff' }}>Loading Cesium...</div>
      </div>
    );
  }

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Viewer
        full
        timeline={true}
        animation={true}
        vrButton={false}
        geocoder={true}
        homeButton={true}
        infoBox={true}
        sceneModePicker={true}
        baseLayerPicker={false}
        navigationHelpButton={false}
        selectionIndicator={true}
        creditContainer={creditContainerRef.current || undefined}
        skyBox={false}
        contextOptions={{
          webgl: {
            alpha: false,
            antialias: true,
            preserveDrawingBuffer: true
          }
        }}
      >
        <ViewerConfig onViewerReady={onViewerReady} />
      </Viewer>
    </div>
  );
}
