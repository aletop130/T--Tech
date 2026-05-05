'use client';

import { create } from 'zustand';

// --------------- TYPES ---------------

export type EntityDomain = 'space' | 'air' | 'maritime' | 'ground' | 'tactical';
export type EntitySource =
  | 'sandbox_actor'
  | 'live_satellite'
  | 'live_station'
  | 'live_vehicle'
  | 'live_aircraft'
  | 'live_vessel'
  | 'conjunction'
  | 'debris'
  | 'threat';

export interface UnifiedEntity {
  id: string;
  name: string;
  entityType: string;
  subtype?: string | null;
  domain: EntityDomain;
  source: EntitySource;
  faction: 'allied' | 'hostile' | 'neutral' | 'unknown';
  position: { lat: number; lon: number; alt_m: number } | null;
  velocity: { speed_ms: number; heading_deg: number } | null;
  lastUpdated: string;
  rawData: unknown;
}

export type EntityIntelSection =
  | 'details'
  | 'intel'
  | 'specs'
  | 'links'
  | 'timeline'
  | 'appearance';

export interface EntityIntelBrief {
  summary: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  capabilities: string[];
  missionProfile: string | null;
  commandControl: string | null;
  confidence: number;
}

export interface EntitySpecEntry {
  key: string;
  value: string;
  unit?: string;
}

export interface EntityLink {
  relatedEntityId: string;
  relatedEntityName: string;
  relatedEntityType: string;
  relationship: string;
}

export interface EntityTimelineEntry {
  timestamp: string;
  event: string;
  detail?: string;
}

// --------------- STORE ---------------

interface EntityIntelState {
  selectedEntity: UnifiedEntity | null;
  panelOpen: boolean;
  expandedSections: Set<EntityIntelSection>;

  intelBrief: EntityIntelBrief | null;
  intelLoading: boolean;
  specifications: EntitySpecEntry[];
  links: EntityLink[];
  timeline: EntityTimelineEntry[];

  selectEntity: (entity: UnifiedEntity | null) => void;
  clearSelection: () => void;
  toggleSection: (section: EntityIntelSection) => void;
  setIntelBrief: (brief: EntityIntelBrief | null) => void;
  setIntelLoading: (loading: boolean) => void;
  setSpecifications: (specs: EntitySpecEntry[]) => void;
  setLinks: (links: EntityLink[]) => void;
  setTimeline: (entries: EntityTimelineEntry[]) => void;
}

const DEFAULT_EXPANDED: EntityIntelSection[] = ['details', 'intel', 'specs'];

export const useEntityIntelStore = create<EntityIntelState>((set) => ({
  selectedEntity: null,
  panelOpen: false,
  expandedSections: new Set<EntityIntelSection>(DEFAULT_EXPANDED),

  intelBrief: null,
  intelLoading: false,
  specifications: [],
  links: [],
  timeline: [],

  selectEntity: (entity) =>
    set({
      selectedEntity: entity,
      panelOpen: !!entity,
      intelBrief: null,
      intelLoading: false,
      specifications: [],
      links: [],
      timeline: [],
      expandedSections: new Set<EntityIntelSection>(DEFAULT_EXPANDED),
    }),

  clearSelection: () =>
    set({
      selectedEntity: null,
      panelOpen: false,
      intelBrief: null,
      intelLoading: false,
      specifications: [],
      links: [],
      timeline: [],
    }),

  toggleSection: (section) =>
    set((s) => {
      const next = new Set(s.expandedSections);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return { expandedSections: next };
    }),

  setIntelBrief: (brief) => set({ intelBrief: brief, intelLoading: false }),
  setIntelLoading: (loading) => set({ intelLoading: loading }),
  setSpecifications: (specs) => set({ specifications: specs }),
  setLinks: (links) => set({ links }),
  setTimeline: (entries) => set({ timeline: entries }),
}));
