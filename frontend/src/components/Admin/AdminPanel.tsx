'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, Button, Tag, Switch, Callout, Intent, Spinner } from '@blueprintjs/core';
import { api } from '@/lib/api';

interface ServiceHealth {
  name: string;
  status: string;
  latency_ms: number;
  detail: string | null;
}

interface AdminStats {
  satellites: number;
  open_incidents: number;
  incidents_24h: number;
  audit_logs_24h: number;
  ground_stations: number;
  orbits: number;
  conjunctions: number;
}

interface TenantSettings {
  ai_features: boolean;
  auto_conjunction_analysis: boolean;
  space_weather_alerts: boolean;
  tenant_name: string;
}

export function AdminPanel() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [overallHealth, setOverallHealth] = useState<string>('unknown');
  const [healthLoading, setHealthLoading] = useState(true);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const loadAll = useCallback(async () => {
    // Load stats, health, and settings concurrently
    const [statsResult, healthResult, settingsResult] = await Promise.allSettled([
      api.getAdminStats(),
      api.getServiceHealth(),
      api.getSettings(),
    ]);

    if (statsResult.status === 'fulfilled') setStats(statsResult.value);
    if (healthResult.status === 'fulfilled') {
      setServices(healthResult.value.services);
      setOverallHealth(healthResult.value.overall);
    }
    if (settingsResult.status === 'fulfilled') setSettings(settingsResult.value);
    setHealthLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleToggleSetting = async (key: keyof TenantSettings, value: boolean) => {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      const result = await api.updateSettings({ [key]: value });
      setSettings((prev) => (prev ? { ...prev, ...result.settings } as TenantSettings : prev));
    } catch {
      // Revert visual state on failure
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleClearCache = async () => {
    setLoadingAction('cache');
    setActionResult(null);
    try {
      const result = await api.clearCache();
      setActionResult(result);
      void loadAll();
    } catch (error) {
      setActionResult({ success: false, message: error instanceof Error ? error.message : 'Failed to clear cache' });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRunVacuum = async () => {
    setLoadingAction('vacuum');
    setActionResult(null);
    try {
      const result = await api.runDatabaseVacuum();
      setActionResult(result);
    } catch (error) {
      setActionResult({ success: false, message: error instanceof Error ? error.message : 'Failed to run vacuum' });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleExportLogs = async () => {
    setLoadingAction('export');
    setActionResult(null);
    try {
      const blob = await api.exportAuditLogs({ format: 'csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      setActionResult({ success: true, message: 'Audit logs exported successfully' });
    } catch (error) {
      setActionResult({ success: false, message: error instanceof Error ? error.message : 'Failed to export logs' });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRefreshHealth = async () => {
    setHealthLoading(true);
    try {
      const health = await api.getServiceHealth();
      setServices(health.services);
      setOverallHealth(health.overall);
    } catch {
      // keep stale data
    } finally {
      setHealthLoading(false);
    }
  };

  const statusIntent = (s: string) =>
    s === 'healthy' ? 'success' : s === 'degraded' || s === 'unavailable' ? 'warning' : 'danger';

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="cog" className="text-sda-text-secondary" />
          Administration
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Status — REAL service health checks */}
        <div className="border border-[#1e1e1e] bg-[#0a0a0a] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-sda-text-primary flex items-center gap-2">
              <Icon icon="dashboard" size={14} />
              Service Health
            </h2>
            <div className="flex items-center gap-2">
              <Tag intent={statusIntent(overallHealth)} minimal className="text-[10px] uppercase">
                {overallHealth}
              </Tag>
              <Button small minimal icon="refresh" onClick={handleRefreshHealth} loading={healthLoading} />
            </div>
          </div>
          <div className="space-y-2">
            {healthLoading && services.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size={20} />
              </div>
            ) : (
              services.map((svc) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between p-3 border border-[#1a1a1a] bg-[#080808]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 ${
                        svc.status === 'healthy'
                          ? 'bg-sda-accent-green'
                          : svc.status === 'degraded' || svc.status === 'unavailable'
                            ? 'bg-sda-accent-yellow animate-pulse'
                            : 'bg-sda-accent-red animate-pulse'
                      }`}
                    />
                    <span className="text-sm text-sda-text-primary font-code">{svc.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-code tabular-nums text-zinc-500">
                      {svc.latency_ms.toFixed(0)}ms
                    </span>
                    <Tag intent={statusIntent(svc.status)} minimal className="text-[10px]">
                      {svc.status}
                    </Tag>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tenant Settings — REAL, persisted to Redis */}
        <div className="border border-[#1e1e1e] bg-[#0a0a0a] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-sda-text-primary flex items-center gap-2 mb-4">
            <Icon icon="office" size={14} />
            Tenant Settings
          </h2>
          {settings ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider font-code">Tenant Name</label>
                <div className="font-code text-sm text-sda-text-primary mt-1">{settings.tenant_name}</div>
              </div>
              {([
                { key: 'ai_features' as const, label: 'AI Features', desc: 'Enable AI-powered analysis' },
                { key: 'auto_conjunction_analysis' as const, label: 'Auto Conjunction Analysis', desc: 'Run hourly conjunction screening' },
                { key: 'space_weather_alerts' as const, label: 'Space Weather Alerts', desc: 'Receive space weather notifications' },
              ]).map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-sda-text-primary">{item.label}</div>
                    <div className="text-xs text-zinc-500">{item.desc}</div>
                  </div>
                  <Switch
                    checked={settings[item.key] as boolean}
                    disabled={settingsSaving}
                    onChange={() => handleToggleSetting(item.key, !settings[item.key])}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Spinner size={20} />
            </div>
          )}
        </div>

        {/* Platform Stats — REAL from admin/stats endpoint */}
        <div className="border border-[#1e1e1e] bg-[#0a0a0a] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-sda-text-primary flex items-center gap-2 mb-4">
            <Icon icon="chart" size={14} />
            Platform Statistics
          </h2>
          {stats ? (
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: 'Satellites', value: stats.satellites, color: 'text-sda-accent-cyan' },
                { label: 'Ground Stations', value: stats.ground_stations, color: 'text-sda-accent-cyan' },
                { label: 'Orbits Tracked', value: stats.orbits, color: 'text-sda-text-primary' },
                { label: 'Conjunctions', value: stats.conjunctions, color: 'text-sda-accent-yellow' },
                { label: 'Open Incidents', value: stats.open_incidents, color: stats.open_incidents > 0 ? 'text-sda-accent-red' : 'text-sda-accent-green' },
                { label: 'Incidents (24h)', value: stats.incidents_24h, color: 'text-sda-text-primary' },
                { label: 'Audit Logs (24h)', value: stats.audit_logs_24h, color: 'text-sda-text-primary' },
              ]).map((item) => (
                <div key={item.label} className="p-3 border border-[#1a1a1a] bg-[#080808]">
                  <div className={`text-xl font-bold font-code tabular-nums ${item.color}`}>
                    {item.value.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-code mt-0.5">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Spinner size={20} />
            </div>
          )}
        </div>

        {/* Maintenance — REAL endpoints */}
        <div className="border border-[#1e1e1e] bg-[#0a0a0a] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-sda-text-primary flex items-center gap-2 mb-4">
            <Icon icon="wrench" size={14} />
            Maintenance
          </h2>
          {actionResult && (
            <Callout intent={actionResult.success ? Intent.SUCCESS : Intent.DANGER} className="mb-4">
              {actionResult.message}
            </Callout>
          )}
          <div className="space-y-3">
            <Button icon="refresh" fill outlined onClick={handleClearCache} loading={loadingAction === 'cache'}>
              Clear Cache
            </Button>
            <Button icon="database" fill outlined onClick={handleRunVacuum} loading={loadingAction === 'vacuum'}>
              Run Database Vacuum
            </Button>
            <Button icon="export" fill outlined onClick={handleExportLogs} loading={loadingAction === 'export'}>
              Export Audit Logs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
