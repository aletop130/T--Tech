'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Icon, Tag, Spinner, Dialog, Tabs, Tab, Callout, NonIdealState, Card, Elevation } from '@blueprintjs/core';
import { api, ProximityAlert, Incident } from '@/lib/api';
import { formatDistanceToNow } from '@/lib/utils';

interface CompactAlertsButtonProps {
  onAlertClick?: (alert: ProximityAlert) => void;
}

export const CompactAlertsButton: React.FC<CompactAlertsButtonProps> = ({
  onAlertClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'proximity' | 'cyber' | 'maneuver'>('proximity');
  const [proximityAlerts, setProximityAlerts] = useState<ProximityAlert[]>([]);
  const [cyberAlerts, setCyberAlerts] = useState<Incident[]>([]);
  const [maneuverAlerts, setManeuverAlerts] = useState<Incident[]>([]);
  const [proximityLoading, setProximityLoading] = useState(false);
  const [cyberLoading, setCyberLoading] = useState(false);
  const [maneuverLoading, setManeuverLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchProximityAlerts = async () => {
    try {
      setProximityLoading(true);
      const data = await api.getActiveProximityAlerts();
      setProximityAlerts(data);
    } catch (err) {
      console.error('Failed to fetch proximity alerts:', err);
    } finally {
      setProximityLoading(false);
    }
  };

  const fetchCyberAlerts = async () => {
    try {
      setCyberLoading(true);
      const data = await api.getCyberIncidents({ page_size: 20 });
      setCyberAlerts(data.items);
    } catch (err) {
      console.error('Failed to fetch cyber alerts:', err);
    } finally {
      setCyberLoading(false);
    }
  };

  const fetchManeuverAlerts = async () => {
    try {
      setManeuverLoading(true);
      const data = await api.getManeuverIncidents({ page_size: 20 });
      setManeuverAlerts(data.items);
    } catch (err) {
      console.error('Failed to fetch maneuver alerts:', err);
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
    if (isOpen) {
      fetchAllAlerts();
    }
  }, [isOpen]);

  const criticalCount = cyberAlerts.filter(a => a.severity === 'critical').length;
  const highCount = cyberAlerts.filter(a => a.severity === 'high').length;
  const totalAlerts = proximityAlerts.length + cyberAlerts.length + maneuverAlerts.length;

  const getSeverityIntent = (severity: string) => {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'primary';
      default: return 'none';
    }
  };

  const getSeverityIcon = (severity: string) => {
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

  const handleAlertClick = useCallback((alert: ProximityAlert) => {
    onAlertClick?.(alert);
    setIsOpen(false);
  }, [onAlertClick]);

  const renderProximityContent = () => {
    if (proximityLoading && proximityAlerts.length === 0) {
      return <div className="flex items-center justify-center py-8"><Spinner size={30} /></div>;
    }

    if (proximityAlerts.length === 0) {
      return <NonIdealState icon="tick-circle" title="No Proximity Alerts" description="All clear! No proximity alerts detected." />;
    }

    return (
      <div className="space-y-2">
        {proximityAlerts.map((alert) => (
          <div
            key={alert.event_id}
            className={`p-3 rounded-lg cursor-pointer transition-colors ${
              alert.alert_level === 'critical' ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/30' : 'bg-sda-bg-tertiary hover:bg-sda-bg-tertiary/80'
            }`}
            onClick={() => handleAlertClick(alert)}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Icon icon={alert.alert_level === 'critical' ? 'error' : 'warning-sign'} intent={alert.alert_level === 'critical' ? 'danger' : 'warning'} />
                <span className="font-medium text-sda-text-primary">{alert.primary_satellite_name} ↔ {alert.secondary_satellite_name}</span>
              </div>
              <Tag intent={alert.alert_level === 'critical' ? 'danger' : 'warning'} minimal>{alert.alert_level}</Tag>
            </div>
            <div className="text-sm text-sda-text-secondary ml-6">
              Distance: {alert.distance_km?.toFixed(2)} km | TCA: {alert.predicted_tca ? formatDistanceToNow(new Date(alert.predicted_tca)) : 'N/A'}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCyberContent = () => {
    if (cyberLoading && cyberAlerts.length === 0) {
      return <div className="flex items-center justify-center py-8"><Spinner size={30} /></div>;
    }

    if (cyberAlerts.length === 0) {
      return <NonIdealState icon="shield" title="No Cyber Alerts" description="No cyber attacks detected on ground stations." />;
    }

    return (
      <div className="space-y-2">
        {cyberAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-3 rounded-lg cursor-pointer transition-colors ${
              alert.severity === 'critical' ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/30' : 
              alert.severity === 'high' ? 'bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30' : 
              'bg-sda-bg-tertiary hover:bg-sda-bg-tertiary/80'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Icon icon={getSeverityIcon(alert.severity) as any} intent={getSeverityIntent(alert.severity)} />
                <span className="font-medium text-sda-text-primary">{getAttackType(alert.description || '')}</span>
              </div>
              <div className="flex gap-1">
                <Tag intent={getSeverityIntent(alert.severity)} minimal>{alert.severity.toUpperCase()}</Tag>
                <Tag minimal>{alert.status.toUpperCase()}</Tag>
              </div>
            </div>
            <div className="text-sm text-sda-text-secondary ml-6">
              Target: {alert.affected_assets?.[0]?.name || 'Unknown'} | Time: {formatDistanceToNow(new Date(alert.detected_at))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderManeuverContent = () => {
    if (maneuverLoading && maneuverAlerts.length === 0) {
      return <div className="flex items-center justify-center py-8"><Spinner size={30} /></div>;
    }

    if (maneuverAlerts.length === 0) {
      return <NonIdealState icon="move" title="No Maneuver Alerts" description="No satellite maneuvers detected." />;
    }

    return (
      <div className="space-y-2">
        {maneuverAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-3 rounded-lg cursor-pointer transition-colors ${
              alert.severity === 'critical' ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/30' : 
              alert.severity === 'high' ? 'bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30' : 
              'bg-sda-bg-tertiary hover:bg-sda-bg-tertiary/80'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Icon icon="move" intent={getSeverityIntent(alert.severity)} />
                <span className="font-medium text-sda-text-primary">{alert.affected_assets?.[0]?.name || 'Satellite'}</span>
              </div>
              <Tag intent={getSeverityIntent(alert.severity)} minimal>{alert.severity.toUpperCase()}</Tag>
            </div>
            <div className="text-sm text-sda-text-secondary ml-6">
              Type: {alert.incident_type || 'maneuver'} | Time: {formatDistanceToNow(new Date(alert.detected_at))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        minimal
        small
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1"
      >
        <Icon 
          icon={totalAlerts > 0 ? 'warning-sign' : 'notifications'} 
          intent={totalAlerts > 0 ? 'warning' : 'none'}
        />
        <span>Alerts</span>
        {totalAlerts > 0 && (
          <Tag minimal intent="warning" className="text-[10px] px-1">
            {totalAlerts}
          </Tag>
        )}
      </Button>

      <Button
        icon="maximize"
        minimal
        small
        onClick={() => setIsOpen(true)}
        title="Espandi alerts"
      />
      <Button
        icon="refresh"
        minimal
        small
        loading={proximityLoading || cyberLoading || maneuverLoading}
        onClick={fetchAllAlerts}
        title="Aggiorna alerts"
      />

      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Icon icon="warning-sign" intent={totalAlerts > 0 ? 'warning' : 'none'} />
            <span>Alerts - Space Domain Awareness</span>
          </div>
        }
        style={{ width: '70vw', maxWidth: 800, backgroundColor: 'var(--sda-bg-secondary)' }}
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
              {totalAlerts} Total
            </Tag>
            <span className="ml-auto text-sm text-sda-text-muted self-center">
              Updated {formatDistanceToNow(lastUpdated)}
            </span>
          </div>

          <Tabs 
            id="alerts-tabs-dialog" 
            selectedTabId={activeTab}
            onChange={(newTab) => setActiveTab(newTab as 'proximity' | 'cyber' | 'maneuver')}
            large
          >
            <Tab 
              id="proximity" 
              title={
                <span className="flex items-center gap-2">
                  <Icon icon="tick-circle" />
                  Proximity ({proximityAlerts.length})
                </span>
              }
              panel={
                <div style={{ height: '400px', overflowY: 'auto', padding: '12px' }}>
                  {renderProximityContent()}
                </div>
              }
            />
            <Tab 
              id="cyber" 
              title={
                <span className="flex items-center gap-2">
                  <Icon icon="shield" />
                  Cyber ({cyberAlerts.length})
                </span>
              }
              panel={
                <div style={{ height: '400px', overflowY: 'auto', padding: '12px' }}>
                  {renderCyberContent()}
                </div>
              }
            />
            <Tab 
              id="maneuver" 
              title={
                <span className="flex items-center gap-2">
                  <Icon icon="move" />
                  Maneuver ({maneuverAlerts.length})
                </span>
              }
              panel={
                <div style={{ height: '400px', overflowY: 'auto', padding: '12px' }}>
                  {renderManeuverContent()}
                </div>
              }
            />
          </Tabs>
        </div>
      </Dialog>
    </div>
  );
};
