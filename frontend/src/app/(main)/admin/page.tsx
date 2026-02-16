'use client';

import { useState, useEffect } from 'react';
import { Card, Elevation, Icon, Button, Tag, Switch, Callout, Intent } from '@blueprintjs/core';
import { api } from '@/lib/api';

export default function AdminPage() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [stats, setStats] = useState<{ satellites: number; open_incidents: number; incidents_24h: number; audit_logs_24h: number } | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const data = await api.getAdminStats();
      setStats(data);
    } catch (error) {
      console.warn('Failed to load stats:', error);
    }
  };

  const handleClearCache = async () => {
    setLoadingAction('cache');
    setActionResult(null);
    try {
      const result = await api.clearCache();
      setActionResult(result);
      await loadStats();
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

  const handleDownloadReport = async () => {
    setLoadingAction('report');
    setActionResult(null);
    try {
      const report = await api.getSystemReport();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system_report_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      setActionResult({ success: true, message: 'System report downloaded successfully' });
    } catch (error) {
      setActionResult({ success: false, message: error instanceof Error ? error.message : 'Failed to download report' });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="cog" className="text-sda-text-secondary" />
          Administration
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Status */}
        <Card elevation={Elevation.TWO} className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="dashboard" />
            System Status
          </h2>

          <div className="space-y-3">
            {[
              { name: 'API Server', status: 'healthy', uptime: '99.9%' },
              { name: 'Database', status: 'healthy', uptime: '99.9%' },
              { name: 'Redis Cache', status: 'healthy', uptime: '99.9%' },
              { name: 'MinIO Storage', status: 'healthy', uptime: '99.8%' },
              { name: 'Celery Workers', status: 'healthy', uptime: '99.5%' },
              { name: 'AI Service', status: 'degraded', uptime: '95.0%' },
            ].map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between p-3 bg-sda-bg-tertiary rounded-lg"
              >
                <div className="flex items-center gap-3">
                   <div
                     className={`w-2 h-2 rounded-full ${
                       service.status === 'healthy'
                         ? 'bg-sda-accent-green'
                         : 'bg-sda-accent-yellow animate-pulse'
                     }`}
                   />
                   <span className="text-sda-text-primary">{service.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-sda-text-muted">
                    {service.uptime}
                  </span>
                  <Tag
                    intent={service.status === 'healthy' ? 'success' : 'warning'}
                    minimal
                  >
                    {service.status}
                  </Tag>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Tenant Settings */}
        <Card elevation={Elevation.TWO} className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="office" />
            Tenant Settings
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-sda-text-secondary">Tenant Name</label>
              <div className="font-medium">Default Tenant</div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">AI Features</div>
                <div className="text-sm text-sda-text-secondary">
                  Enable AI-powered analysis
                </div>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Auto Conjunction Analysis</div>
                <div className="text-sm text-sda-text-secondary">
                  Run hourly conjunction screening
                </div>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Space Weather Alerts</div>
                <div className="text-sm text-sda-text-secondary">
                  Receive space weather notifications
                </div>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>

        {/* API Usage */}
        <Card elevation={Elevation.TWO} className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="chart" />
            API Usage (Last 24h)
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold">12,453</div>
              <div className="text-sm text-sda-text-secondary">Total Requests</div>
            </div>
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold">45ms</div>
              <div className="text-sm text-sda-text-secondary">Avg Latency</div>
            </div>
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold">256</div>
              <div className="text-sm text-sda-text-secondary">AI Calls</div>
            </div>
            <div className="p-4 bg-sda-bg-tertiary rounded-lg">
              <div className="text-2xl font-bold text-sda-accent-green">0.1%</div>
              <div className="text-sm text-sda-text-secondary">Error Rate</div>
            </div>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card elevation={Elevation.TWO} className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="wrench" />
            Maintenance
          </h2>

          {actionResult && (
            <Callout
              intent={actionResult.success ? Intent.SUCCESS : Intent.DANGER}
              className="mb-4"
            >
              {actionResult.message}
            </Callout>
          )}

          <div className="space-y-3">
            <Button
              icon="refresh"
              fill
              outlined
              onClick={handleClearCache}
              loading={loadingAction === 'cache'}
            >
              Clear Cache
            </Button>
            <Button
              icon="database"
              fill
              outlined
              onClick={handleRunVacuum}
              loading={loadingAction === 'vacuum'}
            >
              Run Database Vacuum
            </Button>
            <Button
              icon="export"
              fill
              outlined
              onClick={handleExportLogs}
              loading={loadingAction === 'export'}
            >
              Export Audit Logs
            </Button>
            <Button
              icon="download"
              fill
              outlined
              onClick={handleDownloadReport}
              loading={loadingAction === 'report'}
            >
              Download System Report
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

