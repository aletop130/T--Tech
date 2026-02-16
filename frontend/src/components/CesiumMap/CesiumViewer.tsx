import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { Viewer, useCesium } from 'resium';

interface CesiumViewerProps {
  className?: string;
  onViewerReady?: (viewer: InstanceType<CesiumModule['Viewer']>) => void;
  showTerrain?: boolean;
}

const ViewerConfig = memo(function ViewerConfig({ 
  onViewerReady, 
  showTerrain,
  Cesium 
}: { 
  onViewerReady?: (viewer: InstanceType<CesiumModule['Viewer']>) => void; 
  showTerrain?: boolean;
  Cesium: CesiumModule;
}) {
  const { viewer } = useCesium();
  const isConfiguredRef = useRef(false);
  const terrainLoadedRef = useRef(false);

  const handleReady = useCallback(async () => {
    if (viewer && !isConfiguredRef.current) {
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.dynamicAtmosphereLighting = true;
      viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
      viewer.scene.globe.show = true;
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0a0f');

      try {
        if (showTerrain) {
          if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
            const terrainProvider = await Cesium.createWorldTerrainAsync();
            viewer.scene.globe.terrainProvider = terrainProvider;
            terrainLoadedRef.current = true;
            console.log('Cesium World Terrain loaded');
          }
        }
      } catch (err: any) {
        console.warn('Failed to load terrain:', err);
      }

      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.skyAtmosphere.hueShift = -0.02;
        viewer.scene.skyAtmosphere.saturationShift = 0.2;
        viewer.scene.skyAtmosphere.brightnessShift = 0.1;
      }

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
        
        const satelliteProvider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          credit: new Cesium.Credit('© Esri')
        });
        viewer.imageryLayers.addImageryProvider(satelliteProvider);

      } catch (error) {
        console.warn('Error configuring imagery:', error);
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
  }, [viewer, onViewerReady, showTerrain, Cesium]);

  useEffect(() => {
    handleReady();
  }, [handleReady]);

  return null;
});

export const CesiumViewer = memo(function CesiumViewer({ className, onViewerReady, showTerrain }: CesiumViewerProps) {
  const creditContainerRef = useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [cesium, setCesium] = useState<CesiumModule | null>(null);

  useEffect(() => {
    setIsMounted(true);
    if (typeof document !== 'undefined' && !creditContainerRef.current) {
      creditContainerRef.current = document.createElement('div');
    }

    // Dynamically load Cesium
    getCesium().then(setCesium);
  }, []);

  if (!isMounted || !cesium) {
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
         timeline={false}
         animation={false}
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
        <ViewerConfig onViewerReady={onViewerReady} showTerrain={showTerrain} Cesium={cesium} />
      </Viewer>
    </div>
  );
});
