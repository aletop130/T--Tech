import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { Viewer, useCesium } from 'resium';
import * as Cesium from 'cesium';

// Configure Cesium to use local assets - MUST be done before any Cesium usage
if (typeof window !== 'undefined') {
  window.CESIUM_BASE_URL = '/cesium/';
  Cesium.buildModuleUrl.setBaseUrl('/cesium/');

  if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
    Cesium.Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  }
}

interface CesiumViewerProps {
  className?: string;
  onViewerReady?: (viewer: Cesium.Viewer) => void;
}

const ViewerConfig = memo(function ViewerConfig({ onViewerReady }: { onViewerReady?: (viewer: Cesium.Viewer) => void }) {
  const { viewer } = useCesium();
  const isConfiguredRef = useRef(false);

  const handleReady = useCallback(() => {
    if (viewer && !isConfiguredRef.current) {
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.dynamicAtmosphereLighting = true;
      viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
      viewer.scene.globe.show = true;
      viewer.scene.globe.depthTestAgainstTerrain = false;
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0a0f');
      viewer.scene.skyAtmosphere.show = true;
      viewer.scene.skyAtmosphere.hueShift = -0.02;
      viewer.scene.skyAtmosphere.saturationShift = 0.2;
      viewer.scene.skyAtmosphere.brightnessShift = 0.1;

      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.0001;
      viewer.scene.fog.screenSpaceErrorFactor = 2.0;

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

      try {
        viewer.imageryLayers.removeAll();

        // Use ArcGIS World Imagery for satellite view (free, no API key required)
        const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          credit: new Cesium.Credit('© Esri')
        });
        viewer.imageryLayers.addImageryProvider(satelliteProvider);

        // Add labels layer for place names (optional but helpful)
        const labelsProvider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          credit: new Cesium.Credit('© Esri')
        });
        viewer.imageryLayers.addImageryProvider(labelsProvider);

      } catch (error) {
        console.error('Error configuring imagery:', error);
      }

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
        orientation: {
          heading: 0.0,
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0.0
        }
      });

      isConfiguredRef.current = true;

      if (onViewerReady) {
        onViewerReady(viewer);
      }
    }
  }, [viewer, onViewerReady]);

  useEffect(() => {
    handleReady();
  }, [handleReady]);

  return null;
});

export const CesiumViewer = memo(function CesiumViewer({ className, onViewerReady }: CesiumViewerProps) {
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
        infoBox={false}
        sceneModePicker={true}
        baseLayerPicker={false}
        navigationHelpButton={false}
        selectionIndicator={false}
        creditContainer={creditContainerRef.current ?? undefined}
        skyBox={false}
      >
        <ViewerConfig onViewerReady={onViewerReady} />
      </Viewer>
    </div>
  );
});
