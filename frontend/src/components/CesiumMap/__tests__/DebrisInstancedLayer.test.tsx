/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';

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
    Primitive: vi.fn(function (args: any) {
      // Store args so tests can inspect them later
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

import { DebrisInstancedLayer } from '../DebrisInstancedLayer';

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

describe('DebrisInstancedLayer component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a Cesium primitive and adds it to the viewer', async () => {
    const { viewer, add } = createMockViewer();
    const debris = [{ lon: 0, lat: 0, altKm: 400, noradId: 1 }];

    await act(async () => {
      const container = { nodeType: 1, addEventListener: () => {}, removeEventListener: () => {}, ownerDocument: { defaultView: {} } };
        const root = createRoot(container);
      root.render(<DebrisInstancedLayer viewer={viewer as any} debris={debris} />);
      // Wait for the mocked getCesium promise to resolve
      await Promise.resolve();
    });

    expect(add).toHaveBeenCalledTimes(1);
    const primitive: any = add.mock.calls[0][0];
    expect(primitive.geometryInstances).toBeDefined();
    expect(primitive.geometryInstances.length).toBe(1);
  });

  it('limits debris count to maxDisplayObjects', async () => {
    const { viewer, add } = createMockViewer();
    const debris = Array.from({ length: 20 }, (_, i) => ({
      lon: i,
      lat: i,
      altKm: 400,
      noradId: i,
    }));

    await act(async () => {
      const container = { nodeType: 1, addEventListener: () => {}, removeEventListener: () => {}, ownerDocument: { defaultView: {} } };
        const root = createRoot(container);
      root.render(
        <DebrisInstancedLayer
          viewer={viewer as any}
          debris={debris}
          maxDisplayObjects={10}
        />
      );
      await Promise.resolve();
    });

    expect(add).toHaveBeenCalledTimes(1);
    const primitive: any = add.mock.calls[0][0];
    expect(primitive.geometryInstances.length).toBe(10);
  });

  it('removes the primitive when the component unmounts', async () => {
    const container = { nodeType: 1, addEventListener: () => {}, removeEventListener: () => {}, ownerDocument: { defaultView: {} } };
    const { viewer, add, remove } = createMockViewer();
    let root: any;
    await act(async () => {
      root = createRoot(container);
      root.render(<DebrisInstancedLayer viewer={viewer as any} debris={[]} />);
      await Promise.resolve();
    });

    expect(add).toHaveBeenCalledTimes(1);
    const primitive: any = add.mock.calls[0][0];

    await act(async () => {
      root.unmount();
    });

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(primitive);
  });
});
