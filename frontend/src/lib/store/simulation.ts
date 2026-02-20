import { create } from 'zustand';

export type Faction = 'allied' | 'hostile' | 'neutral' | 'unknown';
export type VehicleType = 'ground_vehicle' | 'aircraft' | 'ship';

export interface SimulationSatellite {
  id: string;
  name: string;
  noradId?: number;
  altitudeKm: number;
  inclinationDeg: number;
  raanDeg: number;
  faction: Faction;
  footprintRadiusKm?: number;
  footprintAreaKm2?: number;
  showCoverage: boolean;
  createdAt: string;
}

export interface SimulationGroundStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitudeM: number;
  coverageRadiusKm: number;
  faction: Faction;
  isOperational: boolean;
  createdAt: string;
}

export interface SimulationVehicle {
  id: string;
  name: string;
  entityType: VehicleType;
  latitude: number;
  longitude: number;
  altitudeM: number;
  headingDeg: number;
  velocityMs: number;
  faction: Faction;
  createdAt: string;
}

export interface CoverageAnalysis {
  faction: Faction | null;
  totalSatellites: number;
  coveredPoints: number;
  coveragePercent: number;
  gapPercent: number;
  overlapPercent: number;
}

interface SimulationState {
  satellites: Map<string, SimulationSatellite>;
  groundStations: Map<string, SimulationGroundStation>;
  vehicles: Map<string, SimulationVehicle>;
  visibleCoverages: Set<string>;
  coverageAnalysis: CoverageAnalysis | null;
  isLoading: boolean;
  lastAction: string | null;
  
  addSatellite: (satellite: SimulationSatellite) => void;
  removeSatellite: (id: string) => void;
  updateSatellite: (id: string, updates: Partial<SimulationSatellite>) => void;
  toggleSatelliteCoverage: (id: string, show?: boolean) => void;
  
  addGroundStation: (station: SimulationGroundStation) => void;
  removeGroundStation: (id: string) => void;
  updateGroundStation: (id: string, updates: Partial<SimulationGroundStation>) => void;
  
  addVehicle: (vehicle: SimulationVehicle) => void;
  removeVehicle: (id: string) => void;
  updateVehicle: (id: string, updates: Partial<SimulationVehicle>) => void;
  
  setCoverageAnalysis: (analysis: CoverageAnalysis | null) => void;
  setLoading: (loading: boolean) => void;
  setLastAction: (action: string | null) => void;
  
  clearAll: () => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  satellites: new Map(),
  groundStations: new Map(),
  vehicles: new Map(),
  visibleCoverages: new Set(),
  coverageAnalysis: null,
  isLoading: false,
  lastAction: null,
  
  addSatellite: (satellite) => {
    set((state) => {
      const newSatellites = new Map(state.satellites);
      newSatellites.set(satellite.id, satellite);
      return { satellites: newSatellites, lastAction: `Added satellite: ${satellite.name}` };
    });
  },
  
  removeSatellite: (id) => {
    set((state) => {
      const newSatellites = new Map(state.satellites);
      const satellite = newSatellites.get(id);
      newSatellites.delete(id);
      const newCoverages = new Set(state.visibleCoverages);
      newCoverages.delete(id);
      return { 
        satellites: newSatellites, 
        visibleCoverages: newCoverages,
        lastAction: `Removed satellite: ${satellite?.name || id}` 
      };
    });
  },
  
  updateSatellite: (id, updates) => {
    set((state) => {
      const newSatellites = new Map(state.satellites);
      const existing = newSatellites.get(id);
      if (existing) {
        newSatellites.set(id, { ...existing, ...updates });
      }
      return { satellites: newSatellites };
    });
  },
  
  toggleSatelliteCoverage: (id, show) => {
    set((state) => {
      const newCoverages = new Set(state.visibleCoverages);
      const satellite = state.satellites.get(id);
      if (show === undefined) {
        if (newCoverages.has(id)) {
          newCoverages.delete(id);
          if (satellite) {
            const newSatellites = new Map(state.satellites);
            newSatellites.set(id, { ...satellite, showCoverage: false });
            return { visibleCoverages: newCoverages, satellites: newSatellites };
          }
        } else {
          newCoverages.add(id);
          if (satellite) {
            const newSatellites = new Map(state.satellites);
            newSatellites.set(id, { ...satellite, showCoverage: true });
            return { visibleCoverages: newCoverages, satellites: newSatellites };
          }
        }
      } else if (show) {
        newCoverages.add(id);
        if (satellite) {
          const newSatellites = new Map(state.satellites);
          newSatellites.set(id, { ...satellite, showCoverage: true });
          return { visibleCoverages: newCoverages, satellites: newSatellites };
        }
      } else {
        newCoverages.delete(id);
        if (satellite) {
          const newSatellites = new Map(state.satellites);
          newSatellites.set(id, { ...satellite, showCoverage: false });
          return { visibleCoverages: newCoverages, satellites: newSatellites };
        }
      }
      return { visibleCoverages: newCoverages };
    });
  },
  
  addGroundStation: (station) => {
    set((state) => {
      const newStations = new Map(state.groundStations);
      newStations.set(station.id, station);
      return { groundStations: newStations, lastAction: `Added ground station: ${station.name}` };
    });
  },
  
  removeGroundStation: (id) => {
    set((state) => {
      const newStations = new Map(state.groundStations);
      const station = newStations.get(id);
      newStations.delete(id);
      return { groundStations: newStations, lastAction: `Removed ground station: ${station?.name || id}` };
    });
  },
  
  updateGroundStation: (id, updates) => {
    set((state) => {
      const newStations = new Map(state.groundStations);
      const existing = newStations.get(id);
      if (existing) {
        newStations.set(id, { ...existing, ...updates });
      }
      return { groundStations: newStations };
    });
  },
  
  addVehicle: (vehicle) => {
    set((state) => {
      const newVehicles = new Map(state.vehicles);
      newVehicles.set(vehicle.id, vehicle);
      return { vehicles: newVehicles, lastAction: `Added vehicle: ${vehicle.name}` };
    });
  },
  
  removeVehicle: (id) => {
    set((state) => {
      const newVehicles = new Map(state.vehicles);
      const vehicle = newVehicles.get(id);
      newVehicles.delete(id);
      return { vehicles: newVehicles, lastAction: `Removed vehicle: ${vehicle?.name || id}` };
    });
  },
  
  updateVehicle: (id, updates) => {
    set((state) => {
      const newVehicles = new Map(state.vehicles);
      const existing = newVehicles.get(id);
      if (existing) {
        newVehicles.set(id, { ...existing, ...updates });
      }
      return { vehicles: newVehicles };
    });
  },
  
  setCoverageAnalysis: (analysis) => {
    set({ coverageAnalysis: analysis });
  },
  
  setLoading: (loading) => {
    set({ isLoading: loading });
  },
  
  setLastAction: (action) => {
    set({ lastAction: action });
  },
  
  clearAll: () => {
    set({
      satellites: new Map(),
      groundStations: new Map(),
      vehicles: new Map(),
      visibleCoverages: new Set(),
      coverageAnalysis: null,
      lastAction: 'Cleared all simulation entities',
    });
  },
}));
