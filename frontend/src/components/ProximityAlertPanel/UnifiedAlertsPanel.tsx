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
  Tabs,
  Tab,
  Dialog,
} from '@blueprintjs/core';
import { api, ProximityAlert, Incident } from '@/lib/api';
import { formatDistanceToNow } from '@/lib/utils';
import styles from './ProximityAlertPanel.module.css';

interface UnifiedAlertsPanelProps {
  onAlertClick?: (alert: ProximityAlert) => void;
  className?: string;
}

export const UnifiedAlertsPanel: React.FC<UnifiedAlertsPanelProps> = ({
  onAlertClick,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<'proximity' | 'cyber' | 'maneuver'>('proximity');
  
  // Proximity state
  const [proximityAlerts, setProximityAlerts] = useState<ProximityAlert[]>([]);
  const [proximityLoading, setProximityLoading] = useState(true);
  const [proximityError, setProximityError] = useState<string | null>(null);
  
  // Cyber state
  const [cyberAlerts, setCyberAlerts] = useState<Incident[]>([]);
  const [cyberLoading, setCyberLoading] = useState(true);
  const [cyberError, setCyberError] = useState<string | null>(null);
  
  // Maneuver state
  const [maneuverAlerts, setManeuverAlerts] = useState<Incident[]>([]);
  const [maneuverLoading, setManeuverLoading] = useState(true);
  const [maneuverError, setManeuverError] = useState<string | null>(null);
  
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchProximityAlerts = async () => {
    try {
      setProximityLoading(true);
      const data = await api.getActiveProximityAlerts();
      setProximityAlerts(data);
      setProximityError(null);
    } catch (err) {
      setProximityError(err instanceof Error ? err.message : 'Failed to fetch alerts');
    } finally {
      setProximityLoading(false);
    }
  };

  const fetchCyberAlerts = async () => {
    try {
      setCyberLoading(true);
      const data = await api.getCyberIncidents({ page_size: 20 });
      setCyberAlerts(data.items);
      setCyberError(null);
    } catch (err) {
      setCyberError(err instanceof Error ? err.message : 'Failed to fetch cyber alerts');
    } finally {
      setCyberLoading(false);
    }
  };

  const fetchManeuverAlerts = async () => {
    try {
      setManeuverLoading(true);
      const data = await api.getManeuverIncidents({ page_size: 20 });
      setManeuverAlerts(data.items);
      setManeuverError(null);
    } catch (err) {
      setManeuverError(err instanceof Error ? err.message : 'Failed to fetch maneuver alerts');
    } finally {
      setManeuverLoading(false);
    }
  };

  const fetchAllAlerts = async () => {
    await Promise.all([
      fetchProximityAlerts(),
      fetchCyberAlerts(),
      fetchManeuverAlerts(),
    ]);
    setLastUpdated(new Date());
  };

  useEffect(() => {
    fetchAllAlerts();
    const interval = setInterval(fetchAllAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const getSeverityIntent = (severity: string): Intent => {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'primary';
      default: return 'none';
    }
  };

  const getSeverityIcon = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warning-sign';
      default: return 'info-sign';
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

  const criticalCount = cyberAlerts.filter(a => a.severity === 'critical').length;
  const highCount = cyberAlerts.filter(a => a.severity === 'high').length;

  const renderProximityContent = () => {
    if (proximityLoading && proximityAlerts.length === 0) {
      return (
        <div className={styles.loading}>
          <Spinner size={30} />
        </div>
      );
    }

    if (proximityError) {
      return (
        <Callout intent="danger" title="Error" className={styles.error}>
          {proximityError}
        </Callout>
      );
    }

    if (proximityAlerts.length === 0) {
      return (
        <NonIdealState
          icon="tick-circle"
          title="No Proximity Alerts"
          description="All clear! No proximity alerts detected."
        />
      );
    }

    return (
      <div className={styles.alertList}>
        {proximityAlerts.map((alert) => (
          <div
            key={alert.event_id}
            className={`${styles.alertItem} ${alert.alert_level === 'critical' ? styles.critical : ''}`}
            onClick={() => onAlertClick?.(alert)}
          >
            <div className={styles.alertHeader}>
              <div className={styles.alertTitle}>
                <Icon 
                  icon={alert.alert_level === 'critical' ? 'error' : 'warning-sign'}
                  intent={alert.alert_level === 'critical' ? 'danger' : 'warning'}
                  className={styles.alertIcon}
                />
                <span className={styles.satellites}>
                  {alert.primary_satellite_name} ↔ {alert.secondary_satellite_name}
                </span>
              </div>
              <div className={styles.alertBadges}>
                <Tag 
                  intent={alert.alert_level === 'critical' ? 'danger' : 'warning'}
                  minimal
                >
                  {alert.alert_level}
                </Tag>
              </div>
            </div>
            <div className={styles.alertDetails}>
              <div className={styles.detail}>
                <span className={styles.label}>Distance:</span>
                <span className={styles.value}>{alert.distance_km.toFixed(2)} km</span>
              </div>
              <div className={styles.detail}>
                <span className={styles.label}>TCA:</span>
                <span className={styles.value}>
                  {alert.predicted_tca ? formatDistanceToNow(new Date(alert.predicted_tca)) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCyberContent = () => {
    if (cyberLoading && cyberAlerts.length === 0) {
      return (
        <div className={styles.loading}>
          <Spinner size={30} />
        </div>
      );
    }

    if (cyberError) {
      return (
        <Callout intent="danger" title="Error" className={styles.error}>
          {cyberError}
        </Callout>
      );
    }

    if (cyberAlerts.length === 0) {
      return (
        <NonIdealState
          icon="shield"
          title="No Cyber Alerts"
          description="No cyber attacks detected on ground stations."
        />
      );
    }

    return (
      <div className={styles.alertList}>
        {cyberAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`${styles.alertItem} ${alert.severity === 'critical' ? styles.critical : ''} ${alert.severity === 'high' ? styles.high : ''}`}
          >
            <div className={styles.alertHeader}>
              <div className={styles.alertTitle}>
                <Icon 
                  icon={getSeverityIcon(alert.severity) as any}
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
        ))}
      </div>
    );
  };

  const renderManeuverContent = () => {
    if (maneuverLoading && maneuverAlerts.length === 0) {
      return (
        <div className={styles.loading}>
          <Spinner size={30} />
        </div>
      );
    }

    if (maneuverError) {
      return (
        <Callout intent="danger" title="Error" className={styles.error}>
          {maneuverError}
        </Callout>
      );
    }

    if (maneuverAlerts.length === 0) {
      return (
        <NonIdealState
          icon="move"
          title="No Maneuver Alerts"
          description="No satellite maneuvers detected."
        />
      );
    }

    return (
      <div className={styles.alertList}>
        {maneuverAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`${styles.alertItem} ${alert.severity === 'critical' ? styles.critical : ''} ${alert.severity === 'high' ? styles.high : ''}`}
          >
            <div className={styles.alertHeader}>
              <div className={styles.alertTitle}>
                <Icon 
                  icon="move"
                  intent={getSeverityIntent(alert.severity)}
                  className={styles.alertIcon}
                />
                <span className={styles.satellites}>
                  {alert.affected_assets?.[0]?.name || 'Satellite'}
                </span>
              </div>
              <div className={styles.alertBadges}>
                <Tag 
                  intent={getSeverityIntent(alert.severity)} 
                  minimal 
                 
                >
                  {alert.severity.toUpperCase()}
                </Tag>
              </div>
            </div>
            <div className={styles.alertDetails}>
              <div className={styles.detail}>
                <span className={styles.label}>Type:</span>
                <span className={styles.value}>{alert.incident_type || 'maneuver'}</span>
              </div>
              <div className={styles.detail}>
                <span className={styles.label}>Time:</span>
                <span className={styles.value}>
                  {formatDistanceToNow(new Date(alert.detected_at))}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card 
      elevation={Elevation.TWO} 
      className={`${styles.container} ${className || ''}`}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>
            <Icon icon="warning-sign" intent={criticalCount > 0 ? 'danger' : 'warning'} />
            Alerts
          </h3>
          <div className={styles.stats}>
            {criticalCount > 0 && (
              <Tag intent="danger" minimal>{criticalCount} Crit</Tag>
            )}
            {highCount > 0 && (
              <Tag intent="warning" minimal>{highCount} High</Tag>
            )}
            <Tag intent="primary" minimal>
              {proximityAlerts.length + cyberAlerts.length + maneuverAlerts.length} Total
            </Tag>
          </div>
        </div>
        <div className={styles.actions}>
          <span className={styles.lastUpdated}>
            Updated {formatDistanceToNow(lastUpdated)}
          </span>
          <Button
            icon="maximize"
            minimal
            onClick={() => setIsExpanded(true)}
            title="Espandi alerts"
          />
          <Button
            icon="refresh"
            minimal
            loading={proximityLoading || cyberLoading || maneuverLoading}
            onClick={fetchAllAlerts}
          />
        </div>
      </div>

      <Tabs 
        id="alerts-tabs" 
        selectedTabId={activeTab}
        onChange={(newTab) => setActiveTab(newTab as 'proximity' | 'cyber' | 'maneuver')}
        large={false}
      >
        <Tab 
          id="proximity" 
          title={
            <span className="flex items-center gap-1">
              <Icon icon="tick-circle" size={12} />
              Proximity ({proximityAlerts.length})
            </span>
          }
          panel={
            <div style={{ height: '150px', overflowY: 'auto', padding: '8px' }}>
              {renderProximityContent()}
            </div>
          }
        />
        <Tab 
          id="cyber" 
          title={
            <span className="flex items-center gap-1">
              <Icon icon="shield" size={12} />
              Cyber ({cyberAlerts.length})
            </span>
          }
          panel={
            <div style={{ height: '150px', overflowY: 'auto', padding: '8px' }}>
              {renderCyberContent()}
            </div>
          }
        />
        <Tab 
          id="maneuver" 
          title={
            <span className="flex items-center gap-1">
              <Icon icon="move" size={12} />
              Maneuver ({maneuverAlerts.length})
            </span>
          }
          panel={
            <div style={{ height: '150px', overflowY: 'auto', padding: '8px' }}>
              {renderManeuverContent()}
            </div>
          }
        />
      </Tabs>

      <Dialog
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        title="Alert - Space Domain Awareness"
        style={{ width: '80vw', maxWidth: 900 }}
        className="bg-sda-bg-secondary"
      >
        <div className="p-4">
          <div className="flex gap-2 mb-4">
            {criticalCount > 0 && (
              <Tag intent="danger" large>{criticalCount} Critical</Tag>
            )}
            {highCount > 0 && (
              <Tag intent="warning" large>{highCount} High</Tag>
            )}
            <Tag intent="primary" large>
              {proximityAlerts.length + cyberAlerts.length + maneuverAlerts.length} Total
            </Tag>
          </div>

          <Tabs 
            id="alerts-tabs-expanded" 
            selectedTabId={activeTab}
            onChange={(newTab) => setActiveTab(newTab as 'proximity' | 'cyber' | 'maneuver')}
            large
          >
            <Tab 
              id="proximity" 
              title={
                <span className="flex items-center gap-2 text-lg">
                  <Icon icon="tick-circle" />
                  Proximity ({proximityAlerts.length})
                </span>
              }
              panel={
                <div style={{ height: '300px', overflowY: 'auto', padding: '12px' }}>
                  {renderProximityContent()}
                </div>
              }
            />
            <Tab 
              id="cyber" 
              title={
                <span className="flex items-center gap-2 text-lg">
                  <Icon icon="shield" />
                  Cyber ({cyberAlerts.length})
                </span>
              }
              panel={
                <div style={{ height: '300px', overflowY: 'auto', padding: '12px' }}>
                  {renderCyberContent()}
                </div>
              }
            />
            <Tab 
              id="maneuver" 
              title={
                <span className="flex items-center gap-2 text-lg">
                  <Icon icon="move" />
                  Maneuver ({maneuverAlerts.length})
                </span>
              }
              panel={
                <div style={{ height: '300px', overflowY: 'auto', padding: '12px' }}>
                  {renderManeuverContent()}
                </div>
              }
            />
          </Tabs>
        </div>
      </Dialog>
    </Card>
  );
};

export default UnifiedAlertsPanel;
