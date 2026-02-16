'use client';

import React, { useEffect, useState } from 'react';
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
  Tooltip,
  Position,
} from '@blueprintjs/core';
import { api, ProximityAlert } from '@/lib/api';
import { formatDistanceToNow } from '@/lib/utils';
import styles from './ProximityAlertPanel.module.css';

interface ProximityAlertPanelProps {
  onAlertClick?: (alert: ProximityAlert) => void;
  className?: string;
}

export const ProximityAlertPanel: React.FC<ProximityAlertPanelProps> = ({
  onAlertClick,
  className,
}) => {
  const [alerts, setAlerts] = useState<ProximityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const data = await api.getActiveProximityAlerts();
      setAlerts(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const getAlertIntent = (level: string): Intent => {
    switch (level) {
      case 'critical':
        return 'danger';
      case 'warning':
        return 'warning';
      default:
        return 'primary';
    }
  };

  const getAlertIcon = (level: string, isHostile: boolean): string => {
    if (isHostile) return 'warning-sign';
    switch (level) {
      case 'critical':
        return 'error';
      case 'warning':
        return 'warning-sign';
      default:
        return 'info-sign';
    }
  };

  const hostileCount = alerts.filter(a => a.is_hostile).length;
  const criticalCount = alerts.filter(a => a.alert_level === 'critical').length;
  const warningCount = alerts.filter(a => a.alert_level === 'warning').length;

  return (
    <Card 
      elevation={Elevation.TWO} 
      className={`${styles.container} ${className || ''}`}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            <Icon icon="warning-sign" intent={hostileCount > 0 ? 'danger' : 'primary'} />
            Proximity Alerts
          </h3>
          <div className={styles.stats}>
            {hostileCount > 0 && (
              <Tag intent="danger" minimal>
                {hostileCount} Hostile
              </Tag>
            )}
            {criticalCount > 0 && (
              <Tag intent="danger" minimal>
                {criticalCount} Critical
              </Tag>
            )}
            {warningCount > 0 && (
              <Tag intent="warning" minimal>
                {warningCount} Warning
              </Tag>
            )}
            <Tag intent="primary" minimal>
              {alerts.length} Total
            </Tag>
          </div>
        </div>
        <div className={styles.actions}>
          <span className={styles.lastUpdated}>
            Updated {formatDistanceToNow(lastUpdated)}
          </span>
          <Button
            icon="refresh"
            small
            minimal
            loading={loading}
            onClick={fetchAlerts}
          />
        </div>
      </div>

      {error && (
        <Callout intent="danger" title="Error" className={styles.error}>
          {error}
        </Callout>
      )}

      <div className={styles.alertList}>
        {loading && alerts.length === 0 ? (
          <div className={styles.loading}>
            <Spinner size={30} />
          </div>
        ) : alerts.length === 0 ? (
          <NonIdealState
            icon="tick-circle"
            title="No Active Alerts"
            description="All satellites are operating within safe proximity thresholds."
          />
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.event_id}
              className={`${styles.alertItem} ${alert.is_hostile ? styles.hostile : ''} ${alert.alert_level === 'critical' ? styles.critical : ''}`}
              onClick={() => onAlertClick?.(alert)}
            >
              <div className={styles.alertHeader}>
                <div className={styles.alertTitle}>
                  <Icon 
                    icon={getAlertIcon(alert.alert_level, alert.is_hostile) as any}
                    intent={getAlertIntent(alert.alert_level)}
                    className={styles.alertIcon}
                  />
                  <span className={styles.satelliteNames}>
                    {alert.primary_satellite_name}
                    <Icon icon="arrow-right" iconSize={12} />
                    {alert.secondary_satellite_name}
                  </span>
                </div>
                <div className={styles.alertBadges}>
                  {alert.is_hostile && (
                    <Tooltip content="Hostile approach detected" position={Position.TOP}>
                      <Tag intent="danger" minimal>
                        HOSTILE
                      </Tag>
                    </Tooltip>
                  )}
                  <Tag 
                    intent={getAlertIntent(alert.alert_level)} 
                    minimal
                  >
                    {alert.alert_level.toUpperCase()}
                  </Tag>
                </div>
              </div>

              <div className={styles.alertDetails}>
                <div className={styles.detail}>
                  <span className={styles.label}>Distance:</span>
                  <span className={styles.value}>
                    {alert.distance_km < 1 
                      ? `${(alert.distance_km * 1000).toFixed(0)} m` 
                      : `${alert.distance_km.toFixed(2)} km`}
                  </span>
                </div>
                {alert.threat_score !== undefined && (
                  <div className={styles.detail}>
                    <span className={styles.label}>Threat:</span>
                    <span className={`${styles.value} ${styles.threatScore}`}>
                      {alert.threat_score.toFixed(0)}/100
                    </span>
                  </div>
                )}
                <div className={styles.detail}>
                  <span className={styles.label}>Time:</span>
                  <span className={styles.value}>
                    {formatDistanceToNow(new Date(alert.timestamp))}
                  </span>
                </div>
                {alert.predicted_tca && (
                  <div className={styles.detail}>
                    <span className={styles.label}>Closest Approach:</span>
                    <span className={styles.value}>
                      {formatDistanceToNow(new Date(alert.predicted_tca))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};

export default ProximityAlertPanel;
