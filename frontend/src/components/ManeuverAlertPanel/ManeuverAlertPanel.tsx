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
} from '@blueprintjs/core';
import { api, Incident } from '@/lib/api';
import { formatDistanceToNow } from '@/lib/utils';
import styles from './ManeuverAlertPanel.module.css';

interface ManeuverAlertPanelProps {
  className?: string;
}

export const ManeuverAlertPanel: React.FC<ManeuverAlertPanelProps> = ({
  className,
}) => {
  const [alerts, setAlerts] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const data = await api.getManeuverIncidents({ page_size: 20 });
      setAlerts(data.items);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch maneuver alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const getSeverityIntent = (severity: string): Intent => {
    switch (severity) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warning';
      case 'medium':
        return 'primary';
      default:
        return 'none';
    }
  };

  const getSeverityIcon = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning-sign';
      default:
        return 'info-sign';
    }
  };

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const highCount = alerts.filter(a => a.severity === 'high').length;
  const openCount = alerts.filter(a => a.status === 'open').length;

  const getSatelliteNames = (incident: Incident): { primary?: string; secondary?: string } => {
    if (!incident.affected_assets || incident.affected_assets.length < 2) {
      return {};
    }
    return {
      primary: incident.affected_assets[0]?.id,
      secondary: incident.affected_assets[1]?.id,
    };
  };

  return (
    <Card 
      elevation={Elevation.TWO} 
      className={`${styles.container} ${className || ''}`}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            <Icon icon="drive-time" intent={criticalCount > 0 ? 'danger' : 'primary'} />
            Maneuver Alerts
          </h3>
          <div className={styles.stats}>
            {criticalCount > 0 && (
              <Tag intent="danger" minimal>
                {criticalCount} Critical
              </Tag>
            )}
            {highCount > 0 && (
              <Tag intent="warning" minimal>
                {highCount} High
              </Tag>
            )}
            {openCount > 0 && (
              <Tag intent="primary" minimal>
                {openCount} Open
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
            icon="drive-time"
            title="No Maneuver Alerts"
            description="No anomalous maneuvers detected."
          />
        ) : (
          alerts.map((alert) => {
            const satellites = getSatelliteNames(alert);
            return (
              <div
                key={alert.id}
                className={`${styles.alertItem} ${alert.severity === 'critical' ? styles.critical : ''}`}
              >
                <div className={styles.alertHeader}>
                  <div className={styles.alertTitle}>
                    <Icon 
                      icon={getSeverityIcon(alert.severity) as any}
                      intent={getSeverityIntent(alert.severity)}
                      className={styles.alertIcon}
                    />
                    <span className={styles.satellites}>
                      {satellites.primary || 'Unknown'}
                      <Icon icon="arrow-right" size={12} />
                      {satellites.secondary || 'Unknown'}
                    </span>
                  </div>
                  <div className={styles.alertBadges}>
                    <Tag 
                      intent={getSeverityIntent(alert.severity)} 
                      minimal
                    >
                      {alert.severity.toUpperCase()}
                    </Tag>
                    <Tag minimal>
                      {alert.status.toUpperCase()}
                    </Tag>
                  </div>
                </div>

                <div className={styles.alertDetails}>
                  <div className={styles.detail}>
                    <span className={styles.label}>Type:</span>
                    <span className={styles.value}>
                      Collision Avoidance
                    </span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Time:</span>
                    <span className={styles.value}>
                      {formatDistanceToNow(new Date(alert.detected_at))}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
};

export default ManeuverAlertPanel;
