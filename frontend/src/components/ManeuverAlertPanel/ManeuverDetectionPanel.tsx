'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Elevation,
  Tag,
  Button,
  Intent,
  Spinner,
  NonIdealState,
  Callout,
  Icon,
  Collapse,
  HTMLTable,
} from '@blueprintjs/core';
import { api, DetectedManeuver, DetectedManeuverType } from '@/lib/api';
import { formatDistanceToNow } from '@/lib/utils';
import styles from './ManeuverDetectionPanel.module.css';

interface ManeuverDetectionPanelProps {
  className?: string;
}

const MANEUVER_CONFIG: Record<DetectedManeuverType, { label: string; intent: Intent; icon: string }> = {
  'station-keeping': { label: 'Station Keeping', intent: 'primary', icon: 'locate' },
  'orbit-raise': { label: 'Orbit Raise', intent: 'warning', icon: 'arrow-up' },
  'orbit-lower': { label: 'Orbit Lower', intent: 'warning', icon: 'arrow-down' },
  'plane-change': { label: 'Plane Change', intent: 'warning', icon: 'exchange' },
  'deorbit': { label: 'Deorbit', intent: 'danger', icon: 'flame' },
  'unknown': { label: 'Unknown', intent: 'none', icon: 'help' },
};

function getManeuverConfig(type: DetectedManeuverType) {
  return MANEUVER_CONFIG[type] || MANEUVER_CONFIG['unknown'];
}

function formatDeltaV(dv: number): string {
  if (dv < 1) return `${(dv * 1000).toFixed(1)} mm/s`;
  if (dv > 1000) return `${(dv / 1000).toFixed(2)} km/s`;
  return `${dv.toFixed(2)} m/s`;
}

export const ManeuverDetectionPanel: React.FC<ManeuverDetectionPanelProps> = ({
  className,
}) => {
  const [maneuvers, setManeuvers] = useState<DetectedManeuver[]>([]);
  const [total, setTotal] = useState(0);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchManeuvers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getRecentManeuvers(50);
      setManeuvers(data.maneuvers);
      setTotal(data.total);
      setLastScan(data.last_scan);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch maneuver detections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManeuvers();
    const interval = setInterval(fetchManeuvers, 60000);
    return () => clearInterval(interval);
  }, [fetchManeuvers]);

  const deorbitCount = maneuvers.filter(m => m.maneuver_type === 'deorbit').length;
  const orbitChangeCount = maneuvers.filter(m =>
    m.maneuver_type === 'orbit-raise' || m.maneuver_type === 'orbit-lower' || m.maneuver_type === 'plane-change'
  ).length;
  const stationKeepingCount = maneuvers.filter(m => m.maneuver_type === 'station-keeping').length;

  return (
    <Card
      elevation={Elevation.TWO}
      className={`${styles.container} ${className || ''}`}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            <Icon icon="rocket-slant" intent={deorbitCount > 0 ? 'danger' : 'primary'} />
            Maneuver Detection
          </h3>
          <div className={styles.stats}>
            {deorbitCount > 0 && (
              <Tag intent="danger" minimal>
                {deorbitCount} Deorbit
              </Tag>
            )}
            {orbitChangeCount > 0 && (
              <Tag intent="warning" minimal>
                {orbitChangeCount} Orbit Change
              </Tag>
            )}
            {stationKeepingCount > 0 && (
              <Tag intent="primary" minimal>
                {stationKeepingCount} SK
              </Tag>
            )}
            <Tag minimal>
              {total} Total
            </Tag>
          </div>
        </div>
        <div className={styles.actions}>
          <span className={styles.lastUpdated}>
            {lastScan ? `Scanned ${formatDistanceToNow(new Date(lastScan))}` : 'Not scanned yet'}
          </span>
          <Button
            icon="refresh"
            small
            minimal
            loading={loading}
            onClick={fetchManeuvers}
          />
        </div>
      </div>

      {error && (
        <Callout intent="danger" title="Error" className={styles.error}>
          {error}
        </Callout>
      )}

      <div className={styles.maneuverList}>
        {loading && maneuvers.length === 0 ? (
          <div className={styles.loading}>
            <Spinner size={30} />
          </div>
        ) : maneuvers.length === 0 ? (
          <NonIdealState
            icon="rocket-slant"
            title="No Maneuvers Detected"
            description="No orbital maneuvers detected from GP history analysis."
          />
        ) : (
          maneuvers.map((maneuver) => {
            const config = getManeuverConfig(maneuver.maneuver_type);
            const isExpanded = expandedId === maneuver.id;

            return (
              <div
                key={maneuver.id}
                className={`${styles.maneuverItem} ${styles[maneuver.maneuver_type.replace('-', '')] || ''}`}
                onClick={() => setExpandedId(isExpanded ? null : maneuver.id)}
              >
                <div className={styles.maneuverHeader}>
                  <div className={styles.maneuverTitle}>
                    <Icon
                      icon={config.icon as any}
                      intent={config.intent}
                      className={styles.maneuverIcon}
                    />
                    <span className={styles.satName}>
                      {maneuver.satellite_name}
                    </span>
                    <span className={styles.noradId}>
                      #{maneuver.norad_id}
                    </span>
                  </div>
                  <div className={styles.maneuverBadges}>
                    <Tag intent={config.intent} minimal>
                      {config.label}
                    </Tag>
                    <Tag minimal intent={maneuver.confidence >= 0.7 ? 'success' : 'none'}>
                      {(maneuver.confidence * 100).toFixed(0)}%
                    </Tag>
                  </div>
                </div>

                <div className={styles.maneuverSummary}>
                  <div className={styles.detail}>
                    <span className={styles.label}>Dv:</span>
                    <span className={styles.value}>{formatDeltaV(maneuver.estimated_delta_v_ms)}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Da:</span>
                    <span className={styles.value}>{maneuver.delta_a_km.toFixed(2)} km</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Di:</span>
                    <span className={styles.value}>{maneuver.delta_i_deg.toFixed(4)}&deg;</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Time:</span>
                    <span className={styles.value}>
                      {formatDistanceToNow(new Date(maneuver.detection_time))}
                    </span>
                  </div>
                </div>

                <Collapse isOpen={isExpanded}>
                  <div className={styles.detailPanel}>
                    {maneuver.before && maneuver.after && (
                      <HTMLTable compact striped className={styles.orbitTable}>
                        <thead>
                          <tr>
                            <th>Element</th>
                            <th>Before</th>
                            <th>After</th>
                            <th>Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>SMA (km)</td>
                            <td>{maneuver.before.semi_major_axis_km.toFixed(3)}</td>
                            <td>{maneuver.after.semi_major_axis_km.toFixed(3)}</td>
                            <td className={maneuver.delta_a_km > 0 ? styles.positive : styles.negative}>
                              {maneuver.delta_a_km > 0 ? '+' : ''}{maneuver.delta_a_km.toFixed(3)}
                            </td>
                          </tr>
                          <tr>
                            <td>Inclination (&deg;)</td>
                            <td>{maneuver.before.inclination_deg.toFixed(4)}</td>
                            <td>{maneuver.after.inclination_deg.toFixed(4)}</td>
                            <td className={maneuver.delta_i_deg > 0 ? styles.positive : styles.negative}>
                              {maneuver.delta_i_deg > 0 ? '+' : ''}{maneuver.delta_i_deg.toFixed(4)}
                            </td>
                          </tr>
                          <tr>
                            <td>Eccentricity</td>
                            <td>{maneuver.before.eccentricity.toFixed(7)}</td>
                            <td>{maneuver.after.eccentricity.toFixed(7)}</td>
                            <td className={maneuver.delta_e > 0 ? styles.positive : styles.negative}>
                              {maneuver.delta_e > 0 ? '+' : ''}{maneuver.delta_e.toFixed(7)}
                            </td>
                          </tr>
                          <tr>
                            <td>RAAN (&deg;)</td>
                            <td>{maneuver.before.raan_deg.toFixed(4)}</td>
                            <td>{maneuver.after.raan_deg.toFixed(4)}</td>
                            <td>
                              {(maneuver.after.raan_deg - maneuver.before.raan_deg).toFixed(4)}
                            </td>
                          </tr>
                          <tr>
                            <td>Arg. Perigee (&deg;)</td>
                            <td>{maneuver.before.arg_perigee_deg.toFixed(4)}</td>
                            <td>{maneuver.after.arg_perigee_deg.toFixed(4)}</td>
                            <td>
                              {(maneuver.after.arg_perigee_deg - maneuver.before.arg_perigee_deg).toFixed(4)}
                            </td>
                          </tr>
                          <tr>
                            <td>Epoch</td>
                            <td colSpan={1}>{maneuver.before.epoch.substring(0, 19)}</td>
                            <td colSpan={2}>{maneuver.after.epoch.substring(0, 19)}</td>
                          </tr>
                        </tbody>
                      </HTMLTable>
                    )}
                    <div className={styles.detailFooter}>
                      <Tag minimal>
                        Estimated Dv: {formatDeltaV(maneuver.estimated_delta_v_ms)}
                      </Tag>
                    </div>
                  </div>
                </Collapse>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
};

export default ManeuverDetectionPanel;
