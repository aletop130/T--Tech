/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { OrbitalTrackLayer } from '../OrbitalTrackLayer';

// Ensure navigator is defined for React 19
if (typeof navigator === 'undefined') {
  // @ts-ignore
  (global as any).navigator = { userAgent: 'node.js' };
}

// Mock Cesium loader with the pieces used by OrbitalTrackLayer
vi.mock('@/lib/cesium/loader', () => {
  const mockCesium: any = {
    Color: {
      fromCssColorString: vi.fn(() => ({})),
      RED: {},
      WHITE: {},
      lerp: vi.fn(() => ({})),
    },
    PolylineGlowMaterialProperty: vi.fn(() => ({})),
  };
  return {
    getCesium: vi.fn(() => Promise.resolve(mockCesium)),
    isCesiumLoaded: vi.fn(),
    getCesiumSync: vi.fn(),
  };
});

function createMockViewer() {
  const add = vi.fn(() => ({
    // The returned entity will be stored by the component
    polyline: { material: {} },
  }));
  const getById = vi.fn(() => ({
    polyline: { material: {} },
  }));
  const remove = vi.fn();
  const viewer: any = {
    entities: {
      add,
      getById,
      remove,
    },
    scene: {
      primitives: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    },
    isDestroyed: vi.fn(() => false),
  };
  return { viewer, add, getById, remove };
}

describe('OrbitalTrackLayer performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates entity with correct trail size quickly', async () => {
    const { viewer, add } = createMockViewer();
    const points = Array.from({ length: 5000 }, () => ({} as any)); // Mock Cartesian3 objects
    const orbitTrack = {
      points,
      timeStartMs: Date.now(),
      stepSec: 60,
    };

    const start = performance.now();
    await act(async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      root.render(<OrbitalTrackLayer viewer={viewer as any} orbitTrack={orbitTrack} />);
      await Promise.resolve();
    });
    const elapsed = performance.now() - start;

    // Verify that an entity was added and that the visible points respect default fraction (0.2) and minTrailPoints (10)
    expect(add).toHaveBeenCalledTimes(1);
    const entityConfig: any = add.mock.calls[0][0];
    // Default trail fraction 0.2 => 1000 points (5000 * 0.2)
    const expectedCount = Math.max(10, Math.floor(points.length * 0.2));
    expect(entityConfig.polyline.positions.length).toBe(expectedCount);

    // Ensure mounting within a modest time budget (0.5 seconds)
    expect(elapsed).toBeLessThan(500);
  });
});
