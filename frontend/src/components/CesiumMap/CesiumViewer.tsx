import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { Viewer, useCesium } from 'resium';

interface CesiumViewerProps {
  className?: string;
  onViewerReady?: (viewer: InstanceType<CesiumModule['Viewer']>) => void;
  showTerrain?: boolean;
  photorealistic3D?: boolean;
}

const ViewerConfig = memo(function ViewerConfig({
  onViewerReady,
  showTerrain,
  photorealistic3D,
  Cesium
}: {
  onViewerReady?: (viewer: InstanceType<CesiumModule['Viewer']>) => void;
  showTerrain?: boolean;
  photorealistic3D?: boolean;
  Cesium: CesiumModule;
}) {
  const { viewer } = useCesium();
  const isConfiguredRef = useRef(false);
  const terrainLoadedRef = useRef(false);
  const tilesetRef = useRef<any>(null);

  // Initial setup (runs once)
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

      // Suppress non-critical Cesium rendering errors (e.g. granularity DeveloperErrors)
      // so they don't block the entire scene
      (viewer.cesiumWidget as any).showRenderLoopErrors = false;
      viewer.scene.renderError.addEventListener((_scene: any, error: any) => {
        console.warn('Cesium render warning (non-fatal):', error?.message || error);
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

  // Toggle photorealistic 3D tiles on/off at runtime
  useEffect(() => {
    if (!viewer || !isConfiguredRef.current) return;

    const togglePhotorealistic = async () => {
      if (photorealistic3D) {
        // Enable: hide globe, load Google 3D Tiles
        viewer.scene.globe.show = false;

        if (!tilesetRef.current) {
          try {
            const tileset = await (Cesium as any).createGooglePhotorealistic3DTileset();
            tilesetRef.current = tileset;
            viewer.scene.primitives.add(tileset);
            console.log('Google Photorealistic 3D Tiles loaded');
          } catch (error) {
            console.warn('Failed to load Google Photorealistic 3D Tiles:', error);
            // Restore globe on failure
            viewer.scene.globe.show = true;
          }
        } else {
          tilesetRef.current.show = true;
        }
      } else {
        // Disable: show globe, hide 3D tiles
        viewer.scene.globe.show = true;

        if (tilesetRef.current) {
          tilesetRef.current.show = false;
        }
      }
    };

    togglePhotorealistic();
  }, [viewer, photorealistic3D, Cesium]);

  return null;
});

export const CesiumViewer = memo(function CesiumViewer({ className, onViewerReady, showTerrain, photorealistic3D }: CesiumViewerProps) {
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
        <ViewerConfig onViewerReady={onViewerReady} showTerrain={showTerrain} photorealistic3D={photorealistic3D} Cesium={cesium} />
      </Viewer>
    </div>
  );
});
