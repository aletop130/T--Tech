import { useState, useEffect, useCallback, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  GUARDIAN_ANGEL_SCENARIO,
  SimulatedSatelliteData,
  GroundUnitData,
  interpolatePosition,
  getSatelliteStatus,
} from './scenarioData';

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

  // Get current satellite states - CINEMATIC positioning
  // Satellites staged for visibility over Mediterranean theater
  const getCurrentSatellites = useCallback(() => {
    return state.satellites.map((sat) => {
      const status = getSatelliteStatus(sat, state.time);
      
      const initialCart = Cesium.Cartographic.fromCartesian(sat.initialPosition);
      const initialLon = Cesium.Math.toDegrees(initialCart.longitude);
      const initialLat = Cesium.Math.toDegrees(initialCart.latitude);
      const altitude = initialCart.height;
      
      let newLon = initialLon;
      let newLat = initialLat;
      
      // Calculate cumulative maneuver offset - applies permanently after maneuver completes
      let totalManeuverOffsetLon = 0;
      let totalManeuverOffsetLat = 0;
      
      if (sat.maneuvers) {
        sat.maneuvers.forEach(maneuver => {
          if (state.time >= maneuver.time + maneuver.duration) {
            // Maneuver completed - apply full offset permanently
            totalManeuverOffsetLon += maneuver.deltaV.tangential * 0.5;
            totalManeuverOffsetLat += maneuver.deltaV.normal * 0.5;
          } else if (state.time >= maneuver.time) {
            // Maneuver in progress - apply partial offset
            const progress = (state.time - maneuver.time) / maneuver.duration;
            totalManeuverOffsetLon += maneuver.deltaV.tangential * progress * 0.5;
            totalManeuverOffsetLat += maneuver.deltaV.normal * progress * 0.5;
          }
        });
      }
      
      // CINEMATIC positioning - satellites drift slowly in theater
      if (sat.id === 'reconsat-1') {
        // Main recon satellite - slight drift over mission area
        // One gentle orbit over 4 hours = very slow drift
        const driftAngle = (state.time / 14400) * 2 * Math.PI; // One orbit over mission
        newLon = initialLon + Math.sin(driftAngle) * 2 + totalManeuverOffsetLon;
        newLat = initialLat + Math.cos(driftAngle) * 1 + totalManeuverOffsetLat;
      } else if (sat.id === 'comsat-2') {
        // Comms satellite - offset position
        const driftAngle = (state.time / 14400) * 2 * Math.PI + 1; // Phase offset
        newLon = initialLon + Math.sin(driftAngle) * 2;
        newLat = initialLat + Math.cos(driftAngle) * 1;
      } else if (sat.id === 'hostile-sat') {
        // Hostile satellite - appears at 0:48 (2880s), approaches then backs off
        if (state.time < 2880) {
          // Before appearance, position off-screen
          newLon = initialLon + 20;
          newLat = initialLat + 10;
        } else if (state.time < 3600) {
          // After 0:48, moves into theater - approaching reconsat
          const approachTime = (state.time - 2880) / 720; // 12 minute approach
          const startLon = initialLon + 15;
          const startLat = initialLat + 8;
          newLon = startLon - approachTime * 15; // Move toward ReconSat-1
          newLat = startLat - approachTime * 8;
        } else {
          // After reconsat's avoidance at t=3600, hostile backs off
          // Stay at a safe distance - retreat from reconsat
          const retreatTime = Math.min((state.time - 3600) / 3600, 1); // 1 hour to fully retreat
          const peakLon = initialLon; // Where it was at t=3600
          const peakLat = initialLat;
          newLon = peakLon + retreatTime * 5; // Move away
          newLat = peakLat + retreatTime * 3;
        }
      }
      
      return {
        ...sat,
        status,
        fuelPercent: Math.max(94, 100 - (state.time / 14400) * 6),
        currentPosition: Cesium.Cartesian3.fromDegrees(newLon, newLat, altitude),
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
        const hostileSat = currentSats.find(s => s.id === 'hostile-sat');
        
        if (reconSat?.currentPosition && hostileSat?.currentPosition) {
          // Look at midpoint between satellites
          const midpoint = Cesium.Cartesian3.midpoint(
            reconSat.currentPosition,
            hostileSat.currentPosition,
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
