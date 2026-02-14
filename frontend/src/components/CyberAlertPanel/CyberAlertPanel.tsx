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
  IconName,
} from '@blueprintjs/core';
import { api, Incident } from '@/lib/api';
import { formatDistanceToNow } from '@/lib/utils';
import styles from './CyberAlertPanel.module.css';

interface CyberAlertPanelProps {
  className?: string;
}

export const CyberAlertPanel: React.FC<CyberAlertPanelProps> = ({
  className,
}) => {
  const [alerts, setAlerts] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const data = await api.getCyberIncidents({ page_size: 20 });
      setAlerts(data.items);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cyber alerts');
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

  const getSeverityIcon = (severity: string): IconName => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning-sign';
      default:
        return 'info-sign';
    }
  };

  const getAttackType = (description: string): string => {
    const lower = description.toLowerCase();
    if (lower.includes('ddos')) return 'DDoS';
    if (lower.includes('intrusion')) return 'Intrusion';
    if (lower.includes('malware')) return 'Malware';
    if (lower.includes('exfiltration')) return 'Data Exfiltration';
    if (lower.includes('jamming')) return 'Jamming';
    if (lower.includes('spoofing')) return 'Spoofing';
    return 'Unknown';
  };

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const highCount = alerts.filter(a => a.severity === 'high').length;
  const openCount = alerts.filter(a => a.status === 'open').length;

  return (
    <Card 
      elevation={Elevation.TWO} 
      className={`${styles.container} ${className || ''}`}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            <Icon icon="shield" intent={criticalCount > 0 ? 'danger' : 'warning'} />
            Cyber Alerts
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
            icon="shield"
            title="No Cyber Alerts"
            description="No cyber attacks detected on ground stations."
          />
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`${styles.alertItem} ${alert.severity === 'critical' ? styles.critical : ''} ${alert.severity === 'high' ? styles.high : ''}`}
            >
              <div className={styles.alertHeader}>
                <div className={styles.alertTitle}>
                  <Icon 
                    icon={getSeverityIcon(alert.severity)}
                    intent={getSeverityIntent(alert.severity)}
                    className={styles.alertIcon}
                  />
                  <span className={styles.attackType}>
                    {getAttackType(alert.description || '')}
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
                  <span className={styles.label}>Target:</span>
                  <span className={styles.value}>
                    {alert.affected_assets?.[0]?.name || 'Unknown'}
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
          ))
        )}
      </div>
    </Card>
  );
};

export default CyberAlertPanel;
