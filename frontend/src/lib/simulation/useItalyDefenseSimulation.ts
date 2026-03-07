import { useState, useEffect, useCallback, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  ITALY_DEFENSE_SCENARIO,
  DEFENSE_BASES,
  DEFENSE_SATELLITES,
  INCOMING_MISSILES,
  ASAT_MISSILES,
  HOSTILE_SATELLITES,
  EW_ATTACKS,
  CYBER_ATTACKS,
  computeMissileTrajectory,
  computeASATTrajectory,
  getMissilePosition,
  computeInterceptPoint,
  getPhaseForTime,
  getAllGroundUnits,
  type MissileState,
  type InterceptorState,
  type DefenseBaseState,
  type SatelliteDefenseData,
  type DefenseScore,
  type SimPhase,
  type ASATMissileState,
  type HostileSatelliteState,
  type SatelliteDefenseState,
  type SatelliteThreatStatus,
} from './italyDefenseScenario';
import type { GroundUnitData } from './scenarioData';

const TIME_ACCELERATION = ITALY_DEFENSE_SCENARIO.timeAcceleration;
const REACTION_DELAY = 15;

// ── EW / Cyber tracking state ─────────────────────────────────────────────

interface EWState {
  id: string;
  targetSatelliteId: string;
  active: boolean;
  countered: boolean;
}

interface CyberState {
  id: string;
  targetSatelliteId: string;
  phase: 'waiting' | 'active' | 'detected' | 'restoring' | 'resolved';
  detected: boolean;
}

// ── Extended simulation state ─────────────────────────────────────────────

interface ItalyDefenseState {
  time: number;
  isPlaying: boolean;
  isPaused: boolean;
  isComplete: boolean;
  currentStep: number;
  currentPhase: SimPhase;
  missiles: MissileState[];
  interceptors: InterceptorState[];
  baseStates: DefenseBaseState[];
  satellites: SatelliteDefenseState[];
  groundUnits: GroundUnitData[];
  score: DefenseScore;
  asatMissiles: ASATMissileState[];
  hostileSatellites: HostileSatelliteState[];
  ewStates: EWState[];
  cyberStates: CyberState[];
  defenseModifier: number;
}

// ── Pre-compute trajectories ──────────────────────────────────────────────

const missileTrajectories = new Map<string, Cesium.Cartesian3[]>();
INCOMING_MISSILES.forEach(m => {
  missileTrajectories.set(m.id, computeMissileTrajectory(m));
});

// ASAT trajectories need satellite positions - compute lazily
const asatTrajectories = new Map<string, Cesium.Cartesian3[]>();
function getASATTrajectory(asatId: string): Cesium.Cartesian3[] {
  let traj = asatTrajectories.get(asatId);
  if (traj) return traj;
  const asat = ASAT_MISSILES.find(a => a.id === asatId);
  if (!asat) return [];
  const targetSat = DEFENSE_SATELLITES.find(s => s.id === asat.targetSatelliteId);
  if (!targetSat) return [];
  traj = computeASATTrajectory(asat, targetSat.initialPosition);
  asatTrajectories.set(asatId, traj);
  return traj;
}

// ── Init functions ────────────────────────────────────────────────────────

function initBaseStates(): DefenseBaseState[] {
  return DEFENSE_BASES.map(base => ({
    id: base.id,
    base,
    status: 'ready',
    activeInterceptors: 0,
    engagedMissiles: [],
  }));
}

function initMissiles(): MissileState[] {
  return INCOMING_MISSILES.map(m => ({
    id: m.id,
    data: m,
    status: 'waiting',
    progress: 0,
    currentPosition: null,
    trajectoryPoints: missileTrajectories.get(m.id) || [],
  }));
}

function initSatellites(): SatelliteDefenseState[] {
  return DEFENSE_SATELLITES.map(sat => ({
    ...sat,
    currentPosition: sat.initialPosition,
    effectivenessMultiplier: 1.0,
    threatStatus: 'nominal' as SatelliteThreatStatus,
    activeThreats: [],
    isDestroyed: false,
  }));
}

function initASATMissiles(): ASATMissileState[] {
  return ASAT_MISSILES.map(a => ({
    id: a.id,
    data: a,
    status: 'waiting',
    progress: 0,
    currentPosition: null,
    trajectoryPoints: getASATTrajectory(a.id),
  }));
}

function initHostileSatellites(): HostileSatelliteState[] {
  return HOSTILE_SATELLITES.map(h => ({
    id: h.id,
    data: h,
    status: 'dormant',
    currentPosition: Cesium.Cartesian3.fromDegrees(
      h.initialPosition.lon, h.initialPosition.lat, h.initialPosition.alt
    ),
    distanceToTarget: Infinity,
    detectedAt: null,
  }));
}

function initEWStates(): EWState[] {
  return EW_ATTACKS.map(ew => ({
    id: ew.id,
    targetSatelliteId: ew.targetSatelliteId,
    active: false,
    countered: false,
  }));
}

function initCyberStates(): CyberState[] {
  return CYBER_ATTACKS.map(c => ({
    id: c.id,
    targetSatelliteId: c.targetSatelliteId,
    phase: 'waiting',
    detected: false,
  }));
}

const INITIAL_SCORE: DefenseScore = {
  launched: 0, intercepted: 0, missed: 0, basesHit: 0,
  asatLaunched: 0, asatIntercepted: 0, asatHit: 0, satellitesDestroyed: 0,
  ewAttacksCountered: 0, cyberAttacksDetected: 0,
};

// ── Defense modifier computation ──────────────────────────────────────────

function computeDefenseModifier(satellites: SatelliteDefenseState[]): number {
  // Find specific satellites by ID
  const sbirs = satellites.find(s => s.id === 'sbirs-geo-1');
  const milstar = satellites.find(s => s.id === 'milstar-3');
  const galileo = satellites.find(s => s.id === 'meo-nav-1');
  const nrol = satellites.find(s => s.id === 'leo-recon-1');
  const cosmo = satellites.find(s => s.id === 'leo-recon-2');

  const earlyWarning = sbirs?.effectivenessMultiplier ?? 1.0;
  const comms = milstar?.effectivenessMultiplier ?? 1.0;
  const nav = galileo?.effectivenessMultiplier ?? 1.0;
  const recon = ((nrol?.effectivenessMultiplier ?? 1.0) + (cosmo?.effectivenessMultiplier ?? 1.0)) / 2;

  return 0.25 * earlyWarning + 0.30 * comms + 0.25 * nav + 0.20 * recon;
}

// ── Interpolate EW degradation curve ──────────────────────────────────────

function interpolateEWCurve(curve: { time: number; effectiveness: number }[], t: number): number {
  if (curve.length === 0) return 1.0;
  if (t <= curve[0].time) return curve[0].effectiveness;
  if (t >= curve[curve.length - 1].time) return curve[curve.length - 1].effectiveness;

  for (let i = 0; i < curve.length - 1; i++) {
    if (t >= curve[i].time && t <= curve[i + 1].time) {
      const frac = (t - curve[i].time) / (curve[i + 1].time - curve[i].time);
      return curve[i].effectiveness + frac * (curve[i + 1].effectiveness - curve[i].effectiveness);
    }
  }
  return 1.0;
}

// ── Main hook ─────────────────────────────────────────────────────────────

export function useItalyDefenseSimulation(viewer: Cesium.Viewer | null, isActive: boolean = false) {
  const [state, setState] = useState<ItalyDefenseState>({
    time: 0,
    isPlaying: false,
    isPaused: false,
    isComplete: false,
    currentStep: 0,
    currentPhase: 'ALERT',
    missiles: initMissiles(),
    interceptors: [],
    baseStates: initBaseStates(),
    satellites: initSatellites(),
    groundUnits: getAllGroundUnits(),
    score: { ...INITIAL_SCORE },
    asatMissiles: initASATMissiles(),
    hostileSatellites: initHostileSatellites(),
    ewStates: initEWStates(),
    cyberStates: initCyberStates(),
    defenseModifier: 1.0,
  });

  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastCameraTimeRef = useRef<number>(-1);
  const hasInitializedCameraRef = useRef<boolean>(false);
  const freeCameraModeRef = useRef<boolean>(true);
  const interceptorIdCounter = useRef<number>(0);
  const engagedMissilesRef = useRef<Set<string>>(new Set());
  const interceptOutcomes = useRef<Map<string, boolean>>(new Map());
  const asatOutcomes = useRef<Map<string, 'evaded' | 'hit_satellite'>>(new Map());

  const togglePlayPause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying, isPaused: false }));
  }, []);

  const resetSimulation = useCallback(() => {
    asatTrajectories.clear();
    setState({
      time: 0,
      isPlaying: false,
      isPaused: false,
      isComplete: false,
      currentStep: 0,
      currentPhase: 'ALERT',
      missiles: initMissiles(),
      interceptors: [],
      baseStates: initBaseStates(),
      satellites: initSatellites(),
      groundUnits: getAllGroundUnits(),
      score: { ...INITIAL_SCORE },
      asatMissiles: initASATMissiles(),
      hostileSatellites: initHostileSatellites(),
      ewStates: initEWStates(),
      cyberStates: initCyberStates(),
      defenseModifier: 1.0,
    });
    lastTimeRef.current = 0;
    lastCameraTimeRef.current = -1;
    hasInitializedCameraRef.current = false;
    freeCameraModeRef.current = false;
    interceptorIdCounter.current = 0;
    engagedMissilesRef.current = new Set();
    interceptOutcomes.current = new Map();
    asatOutcomes.current = new Map();
  }, []);

  const startSimulation = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true, isPaused: false }));
  }, []);

  const nextStep = useCallback(() => {
    setState(prev => {
      if (prev.isComplete) return prev;
      return { ...prev, isPlaying: true, isPaused: false };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState(prev => {
      if (prev.time <= 0) return prev;
      const nextTime = Math.max(prev.time - 60, 0);
      return {
        ...prev,
        time: nextTime,
        currentStep: Math.floor(nextTime / 60),
        currentPhase: getPhaseForTime(nextTime),
        isPlaying: false,
        isPaused: true,
        isComplete: false,
      };
    });
  }, []);

  const toggleFreeCameraMode = useCallback(() => {
    freeCameraModeRef.current = !freeCameraModeRef.current;
    if (freeCameraModeRef.current && viewer) {
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
      lastTimeRef.current = 0;
      return;
    }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      setState(prev => {
        const newTime = prev.time + deltaTime * TIME_ACCELERATION;

        if (newTime >= ITALY_DEFENSE_SCENARIO.duration) {
          return {
            ...prev,
            time: ITALY_DEFENSE_SCENARIO.duration,
            isPlaying: false,
            isComplete: true,
            currentPhase: 'BDA',
          };
        }

        const keyEvents = ITALY_DEFENSE_SCENARIO.keyEvents;
        const nextKeyEvent = keyEvents.find(e => e > prev.time && e <= newTime);
        if (nextKeyEvent !== undefined) {
          const stepNum = Math.floor(nextKeyEvent / 60);
          const updated = updateSimulation(prev, nextKeyEvent);
          return {
            ...updated,
            time: nextKeyEvent,
            isPlaying: false,
            isPaused: true,
            currentStep: stepNum,
            currentPhase: getPhaseForTime(nextKeyEvent),
          };
        }

        return updateSimulation(prev, newTime);
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

  // Core simulation update
  function updateSimulation(prev: ItalyDefenseState, newTime: number): ItalyDefenseState {
    const phase = getPhaseForTime(newTime);
    const newScore = { ...prev.score };
    const newMissiles = prev.missiles.map(m => ({ ...m }));
    const newInterceptors = prev.interceptors.map(i => ({ ...i }));
    const newBaseStates = prev.baseStates.map(bs => ({ ...bs, engagedMissiles: [...bs.engagedMissiles] }));

    // 1. Launch missiles that should be active
    newMissiles.forEach(m => {
      if (m.status === 'waiting' && newTime >= m.data.launchTime) {
        m.status = 'inflight';
        newScore.launched++;
      }
    });

    // 2. Update inflight missile positions
    newMissiles.forEach(m => {
      if (m.status !== 'inflight') return;
      const elapsed = newTime - m.data.launchTime;
      m.progress = Math.min(1, elapsed / m.data.flightDuration);
      m.currentPosition = getMissilePosition(m.trajectoryPoints, m.progress);

      if (m.progress >= 1) {
        m.status = 'impact';
        newScore.missed++;
        newScore.basesHit++;
        const baseIdx = newBaseStates.findIndex(bs => bs.id === m.data.targetBaseId);
        if (baseIdx >= 0) {
          newBaseStates[baseIdx].status = 'damaged';
        }
      }
    });

    // ── Steps 6-9: Space threat simulation ──────────────────────────────

    // 6. ASAT missile tracking
    const newASATs = prev.asatMissiles.map(a => ({ ...a }));
    newASATs.forEach(a => {
      if (a.status === 'waiting' && newTime >= a.data.launchTime) {
        a.status = 'inflight';
        newScore.asatLaunched++;
      }
      if (a.status === 'inflight') {
        const elapsed = newTime - a.data.launchTime;
        a.progress = Math.min(1, elapsed / a.data.flightDuration);
        a.currentPosition = getMissilePosition(a.trajectoryPoints, a.progress);

        if (a.progress >= 1) {
          // Determine outcome
          let outcome = asatOutcomes.current.get(a.id);
          if (!outcome) {
            // Higher intercept probability = satellite evades/we intercept the ASAT
            outcome = Math.random() < a.data.interceptProbability ? 'evaded' : 'hit_satellite';
            asatOutcomes.current.set(a.id, outcome);
          }
          // Force all to 'evaded' for the scripted scenario (satellites survive)
          outcome = 'evaded';
          asatOutcomes.current.set(a.id, outcome);
          a.status = outcome;
          if (outcome === 'evaded') {
            newScore.asatIntercepted++;
          } else {
            newScore.asatHit++;
            newScore.satellitesDestroyed++;
          }
        }
      }
    });

    // 7. Hostile satellite approach interpolation + proximity detection
    const newHostiles = prev.hostileSatellites.map(h => ({ ...h }));
    newHostiles.forEach(h => {
      if (h.status === 'dormant' && newTime >= h.data.activationTime) {
        h.status = 'maneuvering';
        h.detectedAt = newTime;
      }
      if (h.status === 'maneuvering') {
        const elapsed = newTime - h.data.activationTime;
        const approachT = Math.min(1, elapsed / h.data.approachDuration);

        // Interpolate from initial position toward target satellite
        const targetSat = DEFENSE_SATELLITES.find(s => s.id === h.data.targetSatelliteId);
        if (targetSat) {
          const initPos = Cesium.Cartesian3.fromDegrees(
            h.data.initialPosition.lon, h.data.initialPosition.lat, h.data.initialPosition.alt
          );
          h.currentPosition = Cesium.Cartesian3.lerp(
            initPos, targetSat.initialPosition, approachT, new Cesium.Cartesian3()
          );
          h.distanceToTarget = Cesium.Cartesian3.distance(h.currentPosition, targetSat.initialPosition);

          if (h.distanceToTarget <= h.data.dangerRadius) {
            h.status = 'proximate';
          }
        }
      }
      if (h.status === 'proximate') {
        // After spending some time proximate, resolve (neutralized/evaded)
        const elapsed = newTime - h.data.activationTime;
        // Resolve at 1.3x approach duration (some extra time near target before resolution)
        if (elapsed >= h.data.approachDuration * 1.3) {
          h.status = h.data.type === 'killer' ? 'neutralized' : 'evaded';
        }
      }
    });

    // 8. EW degradation curve interpolation → satellite effectivenessMultiplier
    const newEWStates = prev.ewStates.map(ew => ({ ...ew }));
    // Build a map of satellite effectiveness from EW
    const ewEffectiveness = new Map<string, number>();
    newEWStates.forEach((ew, idx) => {
      const attack = EW_ATTACKS[idx];
      if (newTime >= attack.startTime && newTime < attack.endTime) {
        ew.active = true;
        const eff = interpolateEWCurve(attack.degradationCurve, newTime);
        const current = ewEffectiveness.get(ew.targetSatelliteId) ?? 1.0;
        ewEffectiveness.set(ew.targetSatelliteId, Math.min(current, eff));
      } else if (newTime >= attack.endTime) {
        if (ew.active && !ew.countered) {
          ew.countered = true;
          newScore.ewAttacksCountered++;
        }
        ew.active = false;
      }
    });

    // 9. Cyber attack state machine
    const newCyberStates = prev.cyberStates.map(c => ({ ...c }));
    const cyberCompromised = new Set<string>();
    newCyberStates.forEach((c, idx) => {
      const attack = CYBER_ATTACKS[idx];
      const attackEnd = attack.startTime + attack.duration;
      const detectionTime = attack.startTime + attack.detectionDelay;
      const restorationEnd = attackEnd + attack.restorationDelay;

      if (c.phase === 'waiting' && newTime >= attack.startTime) {
        c.phase = 'active';
      }
      if (c.phase === 'active' && newTime >= detectionTime) {
        c.phase = 'detected';
        if (!c.detected) {
          c.detected = true;
          newScore.cyberAttacksDetected++;
        }
      }
      if (c.phase === 'detected' && newTime >= attackEnd) {
        c.phase = 'restoring';
      }
      if (c.phase === 'restoring' && newTime >= restorationEnd) {
        c.phase = 'resolved';
      }
      // Mark satellite as compromised during active/detected phases
      if (c.phase === 'active' || c.phase === 'detected' || c.phase === 'restoring') {
        cyberCompromised.add(c.targetSatelliteId);
      }
    });

    // 5 + 8 + 9: Update satellite states with EW/cyber/ASAT combined effects
    const newSatellites: SatelliteDefenseState[] = prev.satellites.map(sat => {
      const satData = DEFENSE_SATELLITES.find(s => s.id === sat.id);
      let effectivenessMultiplier = 1.0;
      let threatStatus: SatelliteThreatStatus = 'nominal';
      const activeThreats: string[] = [];
      let isDestroyed = false;

      // Check if destroyed by ASAT
      const hitByASAT = newASATs.find(
        a => a.data.targetSatelliteId === sat.id && a.status === 'hit_satellite'
      );
      if (hitByASAT) {
        isDestroyed = true;
        threatStatus = 'destroyed';
        effectivenessMultiplier = 0;
        activeThreats.push(`ASAT: ${hitByASAT.data.name}`);
      }

      if (!isDestroyed) {
        // Check EW degradation
        const ewEff = ewEffectiveness.get(sat.id);
        if (ewEff !== undefined && ewEff < 1.0) {
          effectivenessMultiplier = Math.min(effectivenessMultiplier, ewEff);
          threatStatus = 'ew_degraded';
          const ewAttack = EW_ATTACKS.find(e => e.targetSatelliteId === sat.id);
          if (ewAttack) activeThreats.push(`EW: ${ewAttack.type.toUpperCase()}`);
        }

        // Check cyber compromise
        if (cyberCompromised.has(sat.id)) {
          effectivenessMultiplier *= 0.6; // 40% reduction during cyber attack
          threatStatus = threatStatus === 'ew_degraded' ? 'ew_degraded' : 'cyber_compromised';
          activeThreats.push('CYBER ATTACK');
        }

        // Check if ASAT is inflight toward this satellite (satellite evading)
        const incomingASAT = newASATs.find(
          a => a.data.targetSatelliteId === sat.id && a.status === 'inflight'
        );
        if (incomingASAT) {
          effectivenessMultiplier *= 0.8; // Minor degradation during evasion
          if (threatStatus === 'nominal') threatStatus = 'evading';
          activeThreats.push(`ASAT INBOUND: ${incomingASAT.data.name}`);
        }

        // Check hostile satellite proximity
        const nearbyHostile = newHostiles.find(
          h => h.data.targetSatelliteId === sat.id &&
               (h.status === 'maneuvering' || h.status === 'proximate')
        );
        if (nearbyHostile) {
          const proximityFactor = nearbyHostile.status === 'proximate' ? 0.7 : 0.9;
          effectivenessMultiplier *= proximityFactor;
          activeThreats.push(`CO-ORBITAL: ${nearbyHostile.data.name}`);
        }
      }

      // Simple orbital motion for LEO satellites
      let currentPosition = sat.currentPosition;
      if (satData?.orbitType === 'LEO') {
        const carto = Cesium.Cartographic.fromCartesian(sat.initialPosition);
        const lonDeg = Cesium.Math.toDegrees(carto.longitude);
        const latDeg = Cesium.Math.toDegrees(carto.latitude);
        const alt = carto.height;
        const lonOffset = (newTime * 0.066) % 360;
        const latOffset = Math.sin(newTime * 0.01) * 5;
        currentPosition = Cesium.Cartesian3.fromDegrees(
          lonDeg + lonOffset,
          latDeg + latOffset,
          alt
        );
      }

      // Backward-compatible status field
      const status = isDestroyed ? 'offline' as const :
        effectivenessMultiplier < 0.7 ? 'degraded' as const : 'online' as const;

      return {
        ...sat,
        status,
        currentPosition,
        effectivenessMultiplier: Math.max(0, Math.min(1, effectivenessMultiplier)),
        threatStatus,
        activeThreats,
        isDestroyed,
      };
    });

    // 10. Compute defense modifier from satellite effectiveness
    const defenseModifier = computeDefenseModifier(newSatellites);

    // 3. Spawn interceptors with defense modifier applied to probability
    newMissiles.forEach(m => {
      if (m.status !== 'inflight' || !m.currentPosition) return;
      if (engagedMissilesRef.current.has(m.id)) return;

      for (const bs of newBaseStates) {
        if (bs.status === 'damaged') continue;
        const basePos = Cesium.Cartesian3.fromDegrees(bs.base.position.lon, bs.base.position.lat, 0);
        const dist = Cesium.Cartesian3.distance(basePos, m.currentPosition!);

        if (dist <= bs.base.interceptRange) {
          const result = computeInterceptPoint(
            m.trajectoryPoints,
            m.progress,
            m.data.flightDuration,
            basePos,
            bs.base.interceptSpeed,
          );
          if (result) {
            const iId = `interceptor-${interceptorIdCounter.current++}`;
            let willHit = interceptOutcomes.current.get(m.id);
            if (willHit === undefined) {
              // Apply defense modifier to intercept probability
              willHit = Math.random() < (bs.base.interceptProbability * defenseModifier);
              interceptOutcomes.current.set(m.id, willHit);
            }

            // Apply reaction delay scaling based on early warning effectiveness
            const sbirs = newSatellites.find(s => s.id === 'sbirs-geo-1');
            const earlyWarningFactor = Math.max(0.3, sbirs?.effectivenessMultiplier ?? 1.0);
            const adjustedDelay = Math.min(45, REACTION_DELAY / earlyWarningFactor);

            newInterceptors.push({
              id: iId,
              baseId: bs.id,
              targetMissileId: m.id,
              launchTime: newTime + adjustedDelay,
              interceptTime: newTime + adjustedDelay + result.flightTime,
              startPosition: basePos,
              interceptPosition: result.interceptPosition,
              status: 'inflight',
              progress: 0,
            });
            engagedMissilesRef.current.add(m.id);
            bs.activeInterceptors++;
            bs.engagedMissiles.push(m.id);
            bs.status = 'firing';
            break;
          }
        }
      }
    });

    // 4. Update interceptor positions and check for contact
    newInterceptors.forEach(intc => {
      if (intc.status !== 'inflight') return;
      if (newTime < intc.launchTime) return;

      const elapsed = newTime - intc.launchTime;
      const totalFlight = intc.interceptTime - intc.launchTime;
      intc.progress = Math.min(1, elapsed / totalFlight);

      if (intc.progress >= 0.95) {
        const willHit = interceptOutcomes.current.get(intc.targetMissileId) ?? true;
        if (willHit) {
          intc.status = 'hit';
          const missileIdx = newMissiles.findIndex(m => m.id === intc.targetMissileId);
          if (missileIdx >= 0 && newMissiles[missileIdx].status === 'inflight') {
            newMissiles[missileIdx].status = 'intercepted';
            newMissiles[missileIdx].currentPosition = intc.interceptPosition;
            newScore.intercepted++;
          }
        } else {
          intc.status = 'miss';
        }
        const baseIdx = newBaseStates.findIndex(bs => bs.id === intc.baseId);
        if (baseIdx >= 0) {
          newBaseStates[baseIdx].activeInterceptors = Math.max(0, newBaseStates[baseIdx].activeInterceptors - 1);
          if (newBaseStates[baseIdx].activeInterceptors === 0 && newBaseStates[baseIdx].status === 'firing') {
            newBaseStates[baseIdx].status = 'ready';
          }
        }
      }
    });

    return {
      ...prev,
      time: newTime,
      currentPhase: phase,
      missiles: newMissiles,
      interceptors: newInterceptors,
      baseStates: newBaseStates,
      satellites: newSatellites,
      score: newScore,
      asatMissiles: newASATs,
      hostileSatellites: newHostiles,
      ewStates: newEWStates,
      cyberStates: newCyberStates,
      defenseModifier,
    };
  }

  // Camera control
  useEffect(() => {
    if (!viewer || !isActive) return;
    if (freeCameraModeRef.current) return;
    if (!state.isPlaying) return;
    if (state.time === lastCameraTimeRef.current) return;
    lastCameraTimeRef.current = state.time;

    const cameraSeq = ITALY_DEFENSE_SCENARIO.cameraSequence.find(
      seq => state.time >= seq.time && state.time < seq.time + seq.duration
    );

    switch (cameraSeq?.mode) {
      case 'italy_overview': {
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(12.5, 42.0, 0),
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-50),
            2500000
          )
        );
        break;
      }
      case 'satellite_view': {
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(25.0, 0.0, 35786000),
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-30),
            5000000
          )
        );
        break;
      }
      case 'launch_origin': {
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(51.4, 35.7, 0),
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(-45),
            Cesium.Math.toRadians(-40),
            1500000
          )
        );
        break;
      }
      case 'tracking_wide': {
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(30.0, 38.0, 0),
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-45),
            4000000
          )
        );
        break;
      }
      case 'interception_close': {
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(13.0, 41.0, 0),
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(15),
            Cesium.Math.toRadians(-35),
            1200000
          )
        );
        break;
      }
      default: {
        viewer.camera.lookAt(
          Cesium.Cartesian3.fromDegrees(12.5, 42.0, 0),
          new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-50),
            2500000
          )
        );
        break;
      }
    }
  }, [viewer, isActive, state.time]);

  return {
    time: state.time,
    isPlaying: state.isPlaying,
    isPaused: state.isPaused,
    isComplete: state.isComplete,
    currentStep: state.currentStep,
    currentPhase: state.currentPhase,
    totalDuration: ITALY_DEFENSE_SCENARIO.duration,
    keyEvents: ITALY_DEFENSE_SCENARIO.keyEvents,
    bases: state.baseStates,
    missiles: state.missiles,
    interceptors: state.interceptors,
    satellites: state.satellites,
    groundUnits: state.groundUnits,
    score: state.score,
    asatMissiles: state.asatMissiles,
    hostileSatellites: state.hostileSatellites,
    defenseModifier: state.defenseModifier,
    startSimulation,
    togglePlayPause,
    resetSimulation,
    nextStep,
    prevStep,
    freeCameraMode: freeCameraModeRef.current,
    toggleFreeCameraMode,
  };
}
