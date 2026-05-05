'use client';

import { create } from 'zustand';

// --------------- TYPES ---------------

export interface LayerNode {
  id: string;
  label: string;
  type: 'group' | 'layer';
  parentId: string | null;
  visible: boolean;
  expanded: boolean;
  entityCount: number;
  icon: string;
  color: string;
  opacity: number;
  children: string[];
}

// --------------- DEFAULT TREE ---------------

function defaultNodes(): Record<string, LayerNode> {
  return {
    // ── Top-level groups ──
    actors: {
      id: 'actors',
      label: 'SCENARIO ACTORS',
      type: 'group',
      parentId: null,
      visible: true,
      expanded: true,
      entityCount: 0,
      icon: 'people',
      color: '#22d3ee',
      opacity: 1,
      children: ['actors_allied', 'actors_hostile', 'actors_neutral'],
    },
    actors_allied: {
      id: 'actors_allied',
      label: 'Allied',
      type: 'layer',
      parentId: 'actors',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'shield',
      color: '#22d3ee',
      opacity: 1,
      children: [],
    },
    actors_hostile: {
      id: 'actors_hostile',
      label: 'Hostile',
      type: 'layer',
      parentId: 'actors',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'warning-sign',
      color: '#ef4444',
      opacity: 1,
      children: [],
    },
    actors_neutral: {
      id: 'actors_neutral',
      label: 'Neutral',
      type: 'layer',
      parentId: 'actors',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'circle',
      color: '#fbbf24',
      opacity: 1,
      children: [],
    },

    // ── Intel overlay ──
    intel: {
      id: 'intel',
      label: 'INTEL OVERLAY',
      type: 'group',
      parentId: null,
      visible: false,
      expanded: true,
      entityCount: 0,
      icon: 'satellite',
      color: '#a78bfa',
      opacity: 1,
      children: ['intel_satellites', 'intel_stations', 'intel_vehicles', 'intel_aircraft', 'intel_vessels'],
    },
    intel_satellites: {
      id: 'intel_satellites',
      label: 'Live Satellites',
      type: 'layer',
      parentId: 'intel',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'satellite',
      color: '#22d3ee',
      opacity: 1,
      children: [],
    },
    intel_stations: {
      id: 'intel_stations',
      label: 'Ground Stations',
      type: 'layer',
      parentId: 'intel',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'antenna',
      color: '#22d3ee',
      opacity: 1,
      children: [],
    },
    intel_vehicles: {
      id: 'intel_vehicles',
      label: 'Ground Vehicles',
      type: 'layer',
      parentId: 'intel',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'drive-time',
      color: '#fbbf24',
      opacity: 1,
      children: [],
    },
    intel_aircraft: {
      id: 'intel_aircraft',
      label: 'Aircraft (ADSB)',
      type: 'layer',
      parentId: 'intel',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'airplane',
      color: '#60a5fa',
      opacity: 1,
      children: [],
    },
    intel_vessels: {
      id: 'intel_vessels',
      label: 'Vessels (AIS)',
      type: 'layer',
      parentId: 'intel',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'ship',
      color: '#34d399',
      opacity: 1,
      children: [],
    },

    // ── Tactical planning ──
    tactical: {
      id: 'tactical',
      label: 'TACTICAL PLANNING',
      type: 'group',
      parentId: null,
      visible: true,
      expanded: true,
      entityCount: 0,
      icon: 'map-marker',
      color: '#f97316',
      opacity: 1,
      children: ['tactical_markers', 'tactical_routes', 'tactical_areas', 'tactical_zones'],
    },
    tactical_markers: {
      id: 'tactical_markers',
      label: 'Markers',
      type: 'layer',
      parentId: 'tactical',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'map-marker',
      color: '#ef4444',
      opacity: 1,
      children: [],
    },
    tactical_routes: {
      id: 'tactical_routes',
      label: 'Routes',
      type: 'layer',
      parentId: 'tactical',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'route',
      color: '#22d3ee',
      opacity: 1,
      children: [],
    },
    tactical_areas: {
      id: 'tactical_areas',
      label: 'Areas',
      type: 'layer',
      parentId: 'tactical',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'polygon-filter',
      color: '#fbbf24',
      opacity: 1,
      children: [],
    },
    tactical_zones: {
      id: 'tactical_zones',
      label: 'Zones',
      type: 'layer',
      parentId: 'tactical',
      visible: true,
      expanded: false,
      entityCount: 0,
      icon: 'circle',
      color: '#ef4444',
      opacity: 1,
      children: [],
    },
  };
}

// --------------- STORE ---------------

interface LayerManagerState {
  nodes: Record<string, LayerNode>;
  searchQuery: string;
  rootIds: string[];

  toggleVisibility: (nodeId: string) => void;
  toggleExpanded: (nodeId: string) => void;
  setOpacity: (nodeId: string, opacity: number) => void;
  setSearchQuery: (query: string) => void;
  updateEntityCount: (nodeId: string, count: number) => void;
  resetLayers: () => void;
}

export const useLayerManagerStore = create<LayerManagerState>((set) => ({
  nodes: defaultNodes(),
  searchQuery: '',
  rootIds: ['actors', 'intel', 'tactical'],

  toggleVisibility: (nodeId) =>
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      const visible = !node.visible;
      const next = { ...s.nodes, [nodeId]: { ...node, visible } };
      // Propagate to children
      if (node.type === 'group') {
        for (const childId of node.children) {
          const child = next[childId];
          if (child) next[childId] = { ...child, visible };
        }
      }
      return { nodes: next };
    }),

  toggleExpanded: (nodeId) =>
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      return { nodes: { ...s.nodes, [nodeId]: { ...node, expanded: !node.expanded } } };
    }),

  setOpacity: (nodeId, opacity) =>
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      return { nodes: { ...s.nodes, [nodeId]: { ...node, opacity } } };
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  updateEntityCount: (nodeId, count) =>
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      // Also update parent count
      const next = { ...s.nodes, [nodeId]: { ...node, entityCount: count } };
      if (node.parentId && next[node.parentId]) {
        const parent = next[node.parentId];
        const total = parent.children.reduce(
          (sum, cid) => sum + (next[cid]?.entityCount ?? 0),
          0,
        );
        next[node.parentId] = { ...parent, entityCount: total };
      }
      return { nodes: next };
    }),

  resetLayers: () => set({ nodes: defaultNodes(), searchQuery: '' }),
}));
