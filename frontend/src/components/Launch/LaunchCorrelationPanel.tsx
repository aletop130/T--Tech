'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, Tag, Icon, Collapse, Callout, Button } from '@blueprintjs/core';
import { api } from '@/lib/api';
import type {
  LaunchCorrelationResponse,
  UncorrelatedObjectsResponse,
  UpcomingLaunchesResponse,
  LaunchCorrelation,
  LaunchInfo,
} from '@/lib/api';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function confidenceColor(c: number): string {
  if (c >= 0.7) return '#51cf66';
  if (c >= 0.5) return '#ffd43b';
  return '#ff922b';
}

function LaunchCard({ correlation }: { correlation: LaunchCorrelation }) {
  const [expanded, setExpanded] = useState(false);
  const { launch, correlated_objects, total_correlated } = correlation;

  return (
    <Card
      className="mb-2 p-3 cursor-pointer"
      style={{ backgroundColor: 'var(--sda-bg-secondary)' }}
      onClick={() => setExpanded(!expanded)}
      interactive
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Icon icon="rocket-slant" size={14} style={{ color: '#69db7c' }} />
            <span className="font-medium text-sm" style={{ color: 'var(--sda-text-primary)' }}>
              {launch.name}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
            <span>{formatDate(launch.net)}</span>
            {launch.rocket_name && <span>| {launch.rocket_name}</span>}
            {launch.pad_name && <span>| {launch.pad_name}</span>}
            {launch.pad_country && (
              <Tag minimal small style={{ fontSize: '10px' }}>{launch.pad_country}</Tag>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tag
            intent={total_correlated > 0 ? 'success' : 'none'}
            minimal
            round
          >
            {total_correlated} matched
          </Tag>
          <Icon
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            size={12}
            style={{ color: 'var(--sda-text-secondary)' }}
          />
        </div>
      </div>

      {launch.mission_orbit && (
        <div className="mt-1">
          <Tag minimal small intent="primary" style={{ fontSize: '10px' }}>
            {launch.mission_orbit}
          </Tag>
        </div>
      )}

      <Collapse isOpen={expanded}>
        <div className="mt-3 pt-2 border-t" style={{ borderColor: 'var(--sda-border-default)' }}>
          {correlated_objects.length > 0 ? (
            <div className="space-y-1">
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--sda-text-secondary)' }}>
                Correlated Objects
              </div>
              {correlated_objects.map((obj) => (
                <div
                  key={obj.norad_id}
                  className="flex justify-between items-center text-xs px-2 py-1 rounded"
                  style={{ backgroundColor: 'var(--sda-bg-tertiary)' }}
                >
                  <div className="flex items-center gap-2">
                    <Icon icon="satellite" size={10} style={{ color: 'var(--sda-text-secondary)' }} />
                    <span style={{ color: 'var(--sda-text-primary)' }}>
                      {obj.name}
                    </span>
                    <span style={{ color: 'var(--sda-text-secondary)' }}>
                      NORAD {obj.norad_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {obj.orbit_type && (
                      <Tag minimal style={{ fontSize: '9px' }}>{obj.orbit_type}</Tag>
                    )}
                    <span style={{ color: confidenceColor(obj.correlation_confidence) }}>
                      {(obj.correlation_confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
              No correlated objects found for this launch
            </div>
          )}
        </div>
      </Collapse>
    </Card>
  );
}

function UpcomingLaunchCard({ launch }: { launch: LaunchInfo }) {
  return (
    <Card className="mb-2 p-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon icon="time" size={14} style={{ color: '#74c0fc' }} />
        <span className="font-medium text-sm" style={{ color: 'var(--sda-text-primary)' }}>
          {launch.name}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
        <span>{formatDate(launch.net)}</span>
        {launch.rocket_name && <span>| {launch.rocket_name}</span>}
        {launch.pad_name && <span>| {launch.pad_name}</span>}
        {launch.pad_country && (
          <Tag minimal small style={{ fontSize: '10px' }}>{launch.pad_country}</Tag>
        )}
        {launch.mission_orbit && (
          <Tag minimal small intent="primary" style={{ fontSize: '10px' }}>
            {launch.mission_orbit}
          </Tag>
        )}
      </div>
      {launch.status && (
        <div className="mt-1">
          <Tag minimal small intent={launch.status === 'Go for Launch' ? 'success' : 'none'} style={{ fontSize: '10px' }}>
            {launch.status}
          </Tag>
        </div>
      )}
    </Card>
  );
}

export function LaunchCorrelationPanel() {
  const [recentData, setRecentData] = useState<LaunchCorrelationResponse | null>(null);
  const [uncorrelatedData, setUncorrelatedData] = useState<UncorrelatedObjectsResponse | null>(null);
  const [upcomingData, setUpcomingData] = useState<UpcomingLaunchesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'recent' | 'uncorrelated' | 'upcoming'>('recent');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [recent, uncorrelated, upcoming] = await Promise.all([
        api.getRecentLaunchCorrelations(),
        api.getUncorrelatedObjects(),
        api.getUpcomingLaunches(),
      ]);
      setRecentData(recent);
      setUncorrelatedData(uncorrelated);
      setUpcomingData(upcoming);
    } catch (e) {
      console.error('Failed to fetch launch data:', e);
      setError(e instanceof Error ? e.message : 'Failed to load launch correlation data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-4">
        <Spinner size={20} /> Loading launch data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Callout intent="danger" title="Failed to load launch data">
          {error}
          <div className="mt-2">
            <Button small intent="primary" onClick={fetchData}>Retry</Button>
          </div>
        </Callout>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--sda-text-primary)' }}>
        Launch Correlation Engine
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--sda-text-secondary)' }}>
        Matches new catalog objects to their launch of origin
      </p>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card className="p-3 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
          <div className="text-2xl font-bold" style={{ color: '#69db7c' }}>
            {recentData?.total_launches || 0}
          </div>
          <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>Recent Launches</div>
        </Card>
        <Card className="p-3 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
          <div className="text-2xl font-bold" style={{ color: '#74c0fc' }}>
            {recentData?.total_correlated_objects || 0}
          </div>
          <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>Correlated Objects</div>
        </Card>
        <Card className="p-3 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
          <div className="text-2xl font-bold" style={{ color: uncorrelatedData && uncorrelatedData.total > 0 ? '#ff922b' : '#51cf66' }}>
            {uncorrelatedData?.total || 0}
          </div>
          <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>Uncorrelated</div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {(['recent', 'uncorrelated', 'upcoming'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: activeTab === tab ? 'var(--sda-bg-tertiary)' : 'transparent',
              color: activeTab === tab ? 'var(--sda-text-primary)' : 'var(--sda-text-secondary)',
              border: '1px solid',
              borderColor: activeTab === tab ? 'var(--sda-border-default)' : 'transparent',
            }}
          >
            {tab === 'recent' && `Recent (${recentData?.total_launches || 0})`}
            {tab === 'uncorrelated' && `Uncorrelated (${uncorrelatedData?.total || 0})`}
            {tab === 'upcoming' && `Upcoming (${upcomingData?.total || 0})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'recent' && (
        <div>
          {recentData?.launches.map((lc, i) => (
            <LaunchCard key={lc.launch.id || i} correlation={lc} />
          ))}
          {(!recentData?.launches || recentData.launches.length === 0) && (
            <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>
              No recent launches found
            </div>
          )}
        </div>
      )}

      {activeTab === 'uncorrelated' && (
        <div>
          {uncorrelatedData?.objects.map((obj) => (
            <Card
              key={obj.norad_id}
              className="mb-2 p-3"
              style={{ backgroundColor: 'var(--sda-bg-secondary)' }}
            >
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <Icon icon="warning-sign" size={14} style={{ color: '#ff922b' }} />
                  <span className="font-medium text-sm" style={{ color: 'var(--sda-text-primary)' }}>
                    {obj.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
                    NORAD {obj.norad_id}
                  </span>
                </div>
                <Tag intent="warning" minimal round>Unmatched</Tag>
              </div>
              <div className="flex gap-2 text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
                {obj.epoch && <span>Epoch: {formatDate(obj.epoch)}</span>}
                {obj.orbit_params?.orbit_type && (
                  <Tag minimal small style={{ fontSize: '10px' }}>
                    {String(obj.orbit_params.orbit_type)}
                  </Tag>
                )}
              </div>
              {obj.possible_launches.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
                    Possible launches:
                  </div>
                  {obj.possible_launches.map((pl) => (
                    <div key={pl.id} className="text-xs ml-2" style={{ color: 'var(--sda-text-secondary)' }}>
                      - {pl.name} ({formatDate(pl.net)})
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
          {(!uncorrelatedData?.objects || uncorrelatedData.objects.length === 0) && (
            <Callout intent="success" icon="tick-circle">
              All recent objects have been correlated with launches
            </Callout>
          )}
        </div>
      )}

      {activeTab === 'upcoming' && (
        <div>
          {upcomingData?.launches.map((launch, i) => (
            <UpcomingLaunchCard key={launch.id || i} launch={launch} />
          ))}
          {(!upcomingData?.launches || upcomingData.launches.length === 0) && (
            <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>
              No upcoming launches found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
