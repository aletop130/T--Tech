/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { DebrisInstancedLayer } from '../DebrisInstancedLayer';

// Ensure navigator is defined for React 19 (same as other tests)
if (typeof navigator === 'undefined') {
  // @ts-ignore
  (global as any).navigator = { userAgent: 'node.js' };
}

// Mock the Cesium loader to provide a lightweight Cesium module
vi.mock('@/lib/cesium/loader', () => {
  const mockCesium: any = {
    Cartesian3: {
      fromDegrees: vi.fn(() => ({})),
    },
    Matrix4: {
      fromTranslation: vi.fn(() => ({})),
    },
    SphereGeometry: vi.fn(),
    Color: {
      fromCssColorString: vi.fn(() => ({
        withAlpha: vi.fn(() => ({})),
      })),
    },
    ColorGeometryInstanceAttribute: {
      fromColor: vi.fn(),
    },
    GeometryInstance: vi.fn(),
    PerInstanceColorAppearance: vi.fn(),
    Primitive: vi.fn(function (this: any, args: any) {
      (this as any).args = args;
      (this as any).geometryInstances = args.geometryInstances;
      (this as any).appearance = args.appearance;
    }),
  };

  return {
    getCesium: vi.fn(() => Promise.resolve(mockCesium)),
    isCesiumLoaded: vi.fn(),
    getCesiumSync: vi.fn(),
  };
});

function createMockViewer() {
  const add = vi.fn();
  const remove = vi.fn();
  const viewer: any = {
    scene: {
      primitives: {
        add,
        remove,
      },
    },
    isDestroyed: vi.fn(() => false),
  };
  return { viewer, add, remove };
}

describe('DebrisInstancedLayer performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts 2500+ debris objects quickly', async () => {
    const { viewer, add } = createMockViewer();
    const debris = Array.from({ length: 2500 }, (_, i) => ({
      lon: (i % 360),
      lat: ((i % 180) - 90),
      altKm: 400,
      noradId: i,
    }));

    const start = performance.now();
    await act(async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      root.render(<DebrisInstancedLayer viewer={viewer as any} debris={debris} />);
      // Resolve any pending promises (e.g., getCesium)
      await Promise.resolve();
    });
    const elapsed = performance.now() - start;

    // Validate that the primitive was added and contains the expected number of instances
    expect(add).toHaveBeenCalledTimes(1);
    const primitive: any = add.mock.calls[0][0];
    expect(primitive.geometryInstances.length).toBe(2500);

    // The component should mount within a reasonable time budget (2 seconds)
    expect(elapsed).toBeLessThan(2000);
  });
});
