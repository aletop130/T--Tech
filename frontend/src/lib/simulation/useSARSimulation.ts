import { useState, useEffect, useCallback, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  GUARDIAN_ANGEL_SCENARIO,
  SimulatedSatelliteData,
  GroundUnitData,
  interpolatePosition,
  getSatelliteStatus,
} from './scenarioData';

const STEP_DURATION = 30;
const TIME_ACCELERATION = 1; // 1x speed - 1 real second = 1 sim second

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
    isPlaying: true, // Start automatically
    isPaused: false,
    isComplete: false,
    currentStep: 0,
    satellites: GUARDIAN_ANGEL_SCENARIO.satellites,
    groundUnits: GUARDIAN_ANGEL_SCENARIO.groundUnits,
  });

  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastCameraTimeRef = useRef<number>(-1);

  // Get current satellite states with interpolated position
  const getCurrentSatellites = useCallback(() => {
    return state.satellites.map((sat) => {
      const status = getSatelliteStatus(sat, state.time);
      // Calculate approximate orbital position based on time
      const orbitalPeriod = 90 * 60;
      const timeOffset = (state.time / orbitalPeriod) * 2 * Math.PI;
      const initialCart = Cesium.Cartographic.fromCartesian(sat.initialPosition);
      const lonOffset = timeOffset * 20;
      const newLon = Cesium.Math.toDegrees(initialCart.longitude) + lonOffset;
      
      return {
        ...sat,
        status,
        fuelPercent: Math.max(94, 100 - (state.time / 300) * 6),
        currentPosition: Cesium.Cartesian3.fromDegrees(
          newLon,
          Cesium.Math.toDegrees(initialCart.latitude),
          initialCart.height
        ),
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
      isPlaying: true,
      isPaused: false,
      isComplete: false,
      currentStep: 0,
      satellites: GUARDIAN_ANGEL_SCENARIO.satellites,
      groundUnits: GUARDIAN_ANGEL_SCENARIO.groundUnits,
    });
    lastTimeRef.current = 0;
    lastCameraTimeRef.current = -1;
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

  // Main simulation loop
  useEffect(() => {
    if (!state.isPlaying || state.isPaused || state.isComplete) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
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

  // Camera update - called when time changes (only when simulation is active)
  useEffect(() => {
    if (!viewer || !isActive) return;
    if (state.time === lastCameraTimeRef.current) return;
    lastCameraTimeRef.current = state.time;

    // Find current camera sequence based on time
    const cameraSeq = GUARDIAN_ANGEL_SCENARIO.cameraSequence.find(
      (seq) => state.time >= seq.time && state.time < seq.time + seq.duration
    );

    if (!cameraSeq) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(14.0, 32.0, 500000),
      });
      return;
    }

    const currentSats = getCurrentSatellites();
    const currentGround = getCurrentGroundUnits();

    switch (cameraSeq.mode) {
      case 'satellite': {
        const targetSat = cameraSeq.targetId 
          ? currentSats.find(s => s.id === cameraSeq.targetId)
          : currentSats[0];
        
        if (targetSat && targetSat.currentPosition) {
          // Look at the satellite from a better angle
          viewer.camera.lookAt(
            targetSat.currentPosition,
            new Cesium.HeadingPitchRange(
              Cesium.Math.toRadians(0),
              Cesium.Math.toRadians(-30),
              100000
            )
          );
        }
        break;
      }

      case 'ground': {
        const targetUnit = cameraSeq.targetId
          ? currentGround.find(u => u.id === cameraSeq.targetId)
          : currentGround[0];
        
        if (targetUnit) {
          // Look at ground unit from above with tilt
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
    nextStep,
    prevStep,
  };
}
