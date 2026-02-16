import { describe, it, expect, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useDetourStore } from '../../../lib/store/detour';
import { CollisionAnalyzer } from '../CollisionAnalyzer';

describe('CollisionAnalyzer component', () => {
  beforeEach(() => {
    // Reset store state before each test
    useDetourStore.setState({
      activeAnalyses: {},
      selectedSatellite: null,
      selectedConjunction: null,
      screeningResults: null,
      isLoading: false,
      error: null,
    });
  });

  it('renders high risk as danger intent', () => {
    useDetourStore.setState({
      screeningResults: {
        candidates: [
          {
            candidate_id: 'c1',
            satellite_id: 'sat1',
            tca: '2026-01-01T00:00:00Z',
            miss_distance_km: 1,
            risk_level: 'high',
          },
        ],
        generated_at: '2026-01-01T00:00:00Z',
      },
      isLoading: false,
    });
    const html = renderToString(<CollisionAnalyzer />);
    expect(html).toContain('danger');
  });

  it('renders low risk as warning intent', () => {
    useDetourStore.setState({
      screeningResults: {
        candidates: [
          {
            candidate_id: 'c1',
            satellite_id: 'sat1',
            tca: '2026-01-01T00:00:00Z',
            miss_distance_km: 10,
          },
        ],
        generated_at: '2026-01-01T00:00:00Z',
      },
      isLoading: false,
    });
    const html = renderToString(<CollisionAnalyzer />);
    expect(html).toContain('warning');
  });

  it('shows loading indicator when isLoading', () => {
    useDetourStore.setState({
      isLoading: true,
    });
    const html = renderToString(<CollisionAnalyzer />);
    expect(html).toContain('Loading…');
  });
});
