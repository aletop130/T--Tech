import { useState, useEffect, useCallback, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  GUARDIAN_ANGEL_SCENARIO,
  SimulatedSatelliteData,
  GroundUnitData,
  interpolatePosition,
  getSatelliteStatus,
} from './scenarioData';

let satellitePromise: Promise<typeof import('satellite.js') | null> | null = null;
let satelliteModule: typeof import('satellite.js') | null = null;

const initializeSatellite = () => {
  if (typeof window === 'undefined') return null;
  if (satelliteModule) return Promise.resolve(satelliteModule);
  if (!satellitePromise) {
    satellitePromise = import('satellite.js').then((mod) => {
      satelliteModule = mod;
      return mod;
    });
  }
  return satellitePromise;
};

interface OrbitalPosition {
  lat: number;
  lon: number;
  alt: number;
}

function propagateOrbitalPosition(
  satrec: ReturnType<typeof import('satellite.js')['twoline2satrec']>,
  time: Date
): OrbitalPosition | null {
  if (!satelliteModule || !satrec) return null;
  
  const positionAndVelocity = satelliteModule.propagate(satrec, time);
  if (!positionAndVelocity.position || typeof positionAndVelocity.position !== 'object') {
    return null;
  }
  
  const gmst = satelliteModule.gstime(time);
  const latLonAlt = satelliteModule.eciToGeodetic(
    positionAndVelocity.position as { x: number; y: number; z: number },
    gmst
  );
  
  return {
    lat: latLonAlt.latitude * (180 / Math.PI),
    lon: latLonAlt.longitude * (180 / Math.PI),
    alt: latLonAlt.height,
  };
}

function createSatrecFromTLE(tleLine1: string, tleLine2: string) {
  if (!satelliteModule) return null;
  try {
    return satelliteModule.twoline2satrec(tleLine1, tleLine2);
  } catch (e) {
    console.warn('Failed to create satrec from TLE:', e);
    return null;
  }
}

const STEP_DURATION = 1800; // 30 minutes of mission time between narrative steps
const TIME_ACCELERATION = 120; // 120x speed - 4 hours mission in 2 minutes real time

interface SimulationState {
  time: number;
  isPlaying: boolean;
  isPaused: boolean;
  isComplete: boolean;
  currentStep: number;
  satellites: SimulatedSatelliteData[];
  groundUnits: GroundUnitData[];
}

export function useSARSimulation(viewer: Cesium.Viewer | null, isActive: boolean = false) {
  const [state, setState] = useState<SimulationState>({
    time: 0,
    isPlaying: false, // Don't start automatically - wait for user
    isPaused: false,
    isComplete: false,
    currentStep: 0,
    satellites: GUARDIAN_ANGEL_SCENARIO.satellites,
    groundUnits: GUARDIAN_ANGEL_SCENARIO.groundUnits,
  });

  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastCameraTimeRef = useRef<number>(-1);
  const hasInitializedCameraRef = useRef<boolean>(false);
  const hasStartedRef = useRef<boolean>(false);
  const freeCameraModeRef = useRef<boolean>(true); // Default to free roam
  const satelliteInitializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (satelliteInitializedRef.current) return;
    satelliteInitializedRef.current = true;
    initializeSatellite();
  }, []);

  const getCurrentSatellites = useCallback(() => {
    const simStartTime = new Date();
    const missionTimeMs = state.time * 1000;
    const currentTime = new Date(simStartTime.getTime() + missionTimeMs);

    return state.satellites.map((sat) => {
      const status = getSatelliteStatus(sat, state.time);

      if (sat.id === 'debris-alpha' && state.time < 2880) {
        return {
          ...sat,
          status,
          fuelPercent: 100,
          currentPosition: Cesium.Cartesian3.fromDegrees(50, 50, 400000),
        };
      }

      if (sat.id === 'comsat-2') {
        const targetLon = 14.5;
        const targetLat = 31.5;
        const startLon = 16.0;
        const startLat = 32.0;
        
        let progress = 0;
        if (state.time >= 2880) {
          progress = Math.min((state.time - 2880) / 1800, 1);
        }
        
        const lon = startLon + (targetLon - startLon) * progress;
        const lat = startLat + (targetLat - startLat) * progress;
        
        const altitude = 380000 - progress * 50000;
        
        return {
          ...sat,
          status: progress >= 1 ? 'offline' as const : status,
          fuelPercent: Math.max(0, 100 - progress * 100),
          currentPosition: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
        };
      }

      if (!sat.tleLine1 || !sat.tleLine2) {
        return {
          ...sat,
          status,
          fuelPercent: Math.max(94, 100 - (state.time / 14400) * 6),
          currentPosition: sat.initialPosition,
        };
      }

      const satrec = createSatrecFromTLE(sat.tleLine1, sat.tleLine2);
      if (!satrec) {
        return {
          ...sat,
          status,
          fuelPercent: Math.max(94, 100 - (state.time / 14400) * 6),
          currentPosition: sat.initialPosition,
        };
      }

      let adjustedTleLine1 = sat.tleLine1;
      let adjustedTleLine2 = sat.tleLine2;

      if (sat.id === 'reconsat-1' && sat.maneuvers) {
        let totalDeltaV = { tangential: 0, normal: 0, radial: 0 };
        
        sat.maneuvers.forEach(maneuver => {
          if (state.time >= maneuver.time + maneuver.duration) {
            totalDeltaV.tangential += maneuver.deltaV.tangential;
            totalDeltaV.normal += maneuver.deltaV.normal;
            totalDeltaV.radial += maneuver.deltaV.radial;
          } else if (state.time >= maneuver.time) {
            const progress = (state.time - maneuver.time) / maneuver.duration;
            totalDeltaV.tangential += maneuver.deltaV.tangential * progress;
            totalDeltaV.normal += maneuver.deltaV.normal * progress;
            totalDeltaV.radial += maneuver.deltaV.radial * progress;
          }
        });

        if (totalDeltaV.tangential !== 0 || totalDeltaV.normal !== 0) {
          const parts2 = sat.tleLine2.split(/\s+/);
          let inclination = parseFloat(parts2[2]);
          let raan = parseFloat(parts2[3]);
          
          inclination += totalDeltaV.normal * 0.1;
          raan += totalDeltaV.tangential * 0.1;
          
          adjustedTleLine2 = `2 ${parts2[0]} ${inclination.toFixed(4)} ${raan.toFixed(4)} ${parts2[4]} ${parts2[5]} ${parts2[6]} ${parts2[7]}`;
        }
      }

      const adjustedSatrec = createSatrecFromTLE(adjustedTleLine1, adjustedTleLine2);
      if (!adjustedSatrec) {
        return {
          ...sat,
          status,
          fuelPercent: Math.max(94, 100 - (state.time / 14400) * 6),
          currentPosition: sat.initialPosition,
        };
      }

      const position = propagateOrbitalPosition(adjustedSatrec, currentTime);
      
      if (!position) {
        return {
          ...sat,
          status,
          fuelPercent: Math.max(94, 100 - (state.time / 14400) * 6),
          currentPosition: sat.initialPosition,
        };
      }

      return {
        ...sat,
        status,
        fuelPercent: Math.max(94, 100 - (state.time / 14400) * 6),
        currentPosition: Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt * 1000),
      };
    });
  }, [state.satellites, state.time]);

  // Get current ground unit positions
  const getCurrentGroundUnits = useCallback(() => {
    return state.groundUnits.map((unit) => ({
      ...unit,
      position: interpolatePosition(unit, state.time),
    }));
  }, [state.groundUnits, state.time]);

  // Play
  const togglePlayPause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying, isPaused: false }));
  }, []);

  // Reset simulation
  const resetSimulation = useCallback(() => {
    setState({
      time: 0,
      isPlaying: false, // Don't auto-start on reset
      isPaused: false,
      isComplete: false,
      currentStep: 0,
      satellites: GUARDIAN_ANGEL_SCENARIO.satellites,
      groundUnits: GUARDIAN_ANGEL_SCENARIO.groundUnits,
    });
    lastTimeRef.current = 0;
    lastCameraTimeRef.current = -1;
    hasInitializedCameraRef.current = false;
    hasStartedRef.current = false;
    freeCameraModeRef.current = false;
  }, []);

  // Start the simulation
  const startSimulation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isPlaying: true,
      isPaused: false,
    }));
  }, []);

  // Go to next step (continue simulation)
  const nextStep = useCallback(() => {
    setState((prev) => {
      if (prev.isComplete) return prev;
      return { ...prev, isPlaying: true, isPaused: false };
    });
  }, []);

  // Go to previous step
  const prevStep = useCallback(() => {
    setState((prev) => {
      if (prev.time <= 0) return prev;
      const nextTime = Math.max(prev.time - STEP_DURATION, 0);
      const nextStep = Math.floor(nextTime / STEP_DURATION);
      return {
        ...prev,
        time: nextTime,
        currentStep: nextStep,
        isPlaying: false,
        isPaused: true,
        isComplete: false,
      };
    });
  }, []);

  // Dummy functions for compatibility
  const toggleStepMode = useCallback(() => {}, []);

  // Toggle free camera mode - allows user to freely control camera
  const toggleFreeCameraMode = useCallback(() => {
    freeCameraModeRef.current = !freeCameraModeRef.current;
    if (freeCameraModeRef.current && viewer) {
      // Release Cesium camera from lookAt tracking
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
  }, [viewer]);

  // Main simulation loop
  useEffect(() => {
    if (!state.isPlaying || state.isPaused || state.isComplete) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // Reset lastTimeRef so we don't count paused time when resuming
      lastTimeRef.current = 0;
      return;
    }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      setState((prev) => {
        const newTime = prev.time + deltaTime * TIME_ACCELERATION;
        
        // Check if simulation complete
        if (newTime >= GUARDIAN_ANGEL_SCENARIO.duration) {
          return {
            ...prev,
            time: GUARDIAN_ANGEL_SCENARIO.duration,
            isPlaying: false,
            isComplete: true,
          };
        }

        // Check if we reached next key event - pause there
        const keyEvents = GUARDIAN_ANGEL_SCENARIO.keyEvents;
        const nextKeyEvent = keyEvents.find(e => e > prev.time && e <= newTime);
        
        if (nextKeyEvent !== undefined) {
          const stepNum = Math.floor(nextKeyEvent / STEP_DURATION);
          return {
            ...prev,
            time: nextKeyEvent,
            isPlaying: false,
            isPaused: true,
            currentStep: stepNum,
          };
        }

        return { ...prev, time: newTime };
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state.isPlaying, state.isPaused, state.isComplete]);

  // DISABLED: Initial camera setup - using free roam by default
  // useEffect(() => {
  //   if (!viewer || !isActive) return;
  //   if (hasStartedRef.current) return;
  //   hasStartedRef.current = true;
  //   const currentSats = getCurrentSatellites();
  //   const targetSat = currentSats[0];
  //   if (targetSat && targetSat.currentPosition) {
  //     viewer.camera.lookAt(
  //       targetSat.currentPosition,
  //       new Cesium.HeadingPitchRange(
  //         Cesium.Math.toRadians(0),
  //         Cesium.Math.toRadians(-45),
  //         300000
  //       )
  //     );
  //     hasInitializedCameraRef.current = true;
  //   }
  // }, [viewer, isActive]);

  // DISABLED: Camera update - using free roam by default
  // The cinematic camera sequence is disabled - user has full camera control
  useEffect(() => {
    if (!viewer || !isActive) return;
    if (freeCameraModeRef.current) return;
    if (!hasInitializedCameraRef.current) return;
    if (!state.isPlaying) return;
    if (state.time === lastCameraTimeRef.current) return;
    lastCameraTimeRef.current = state.time;

    const cameraSeq = GUARDIAN_ANGEL_SCENARIO.cameraSequence.find(
      (seq) => state.time >= seq.time && state.time < seq.time + seq.duration
    );

    const currentSats = getCurrentSatellites();
    const currentGround = getCurrentGroundUnits();

    switch (cameraSeq?.mode) {
      case 'theater': {
        // Fixed theater view - camera stays over Mediterranean
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(14.5, 31.5, 0), // Center on mission area
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-60),
            400000 // 400km range - see entire theater
          )
        );
        break;
      }

      case 'maneuver_track': {
        // Track satellite during maneuver - smooth following
        const targetSat = cameraSeq.targetId 
          ? currentSats.find(s => s.id === cameraSeq.targetId)
          : currentSats[0];
        
        if (targetSat?.currentPosition) {
          viewer.camera.lookAt(
            targetSat.currentPosition,
            new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(0),
              Cesium.Math.toRadians(-40),
              200000 // 200km - closer view during action
            )
          );
        }
        break;
      }

      case 'threat_wide': {
        // Wide shot showing both satellites during threat
        const reconSat = currentSats.find(s => s.id === 'reconsat-1');
        const debrisAlpha = currentSats.find(s => s.id === 'debris-alpha');
        
        if (reconSat?.currentPosition && debrisAlpha?.currentPosition) {
          // Look at midpoint between satellites
          const midpoint = Cesium.Cartesian3.midpoint(
            reconSat.currentPosition,
            debrisAlpha.currentPosition,
            new Cesium.Cartesian3()
          );
          viewer.camera.lookAt(
            midpoint,
            new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(0),
              Cesium.Math.toRadians(-50),
              500000 // 500km - wide view to see both
            )
          );
        }
        break;
      }

      case 'transition_to_ground': {
        // Smooth fly-down from orbit to ground
        const targetUnit = cameraSeq.targetId
          ? currentGround.find(u => u.id === cameraSeq.targetId)
          : currentGround[0];
        
        if (targetUnit) {
          viewer.camera.flyTo({
            destination: targetUnit.position,
            orientation: {
              heading: Cesium.Math.toRadians(45),
              pitch: Cesium.Math.toRadians(-45),
              roll: 0,
            },
            duration: 2, // 2 second smooth transition
          });
        }
        break;
      }

      case 'ground': {
        const targetUnit = cameraSeq.targetId
          ? currentGround.find(u => u.id === cameraSeq.targetId)
          : currentGround[0];
        
        if (targetUnit) {
          viewer.camera.lookAt(
            targetUnit.position,
            new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(45),
              Cesium.Math.toRadians(-45),
              30000
            )
          );
        }
        break;
      }

      default:
        // Wide view - Mediterranean
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(14.0, 32.0, 0),
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-60),
            400000
          )
        );
        break;
    }
  }, [viewer, isActive, state.time, getCurrentSatellites, getCurrentGroundUnits]);

  return {
    time: state.time,
    isPlaying: state.isPlaying,
    isComplete: state.isComplete,
    isPaused: state.isPaused,
    stepMode: false,
    currentStep: state.currentStep,
    totalDuration: GUARDIAN_ANGEL_SCENARIO.duration,
    keyEvents: GUARDIAN_ANGEL_SCENARIO.keyEvents,
    satellites: getCurrentSatellites(),
    groundUnits: getCurrentGroundUnits(),
    togglePlayPause,
    resetSimulation,
    toggleStepMode,
    startSimulation,
    nextStep,
    prevStep,
    freeCameraMode: freeCameraModeRef.current,
    toggleFreeCameraMode,
  };
}
