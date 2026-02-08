'use client';

import { Card, Elevation, Icon, Button, Tag, Switch } from '@blueprintjs/core';

export default function AdminPage() {
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
                  <span>{service.name}</span>
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

          <div className="space-y-3">
            <Button icon="refresh" fill outlined>
              Clear Cache
            </Button>
            <Button icon="database" fill outlined>
              Run Database Vacuum
            </Button>
            <Button icon="export" fill outlined>
              Export Audit Logs
            </Button>
            <Button icon="download" fill outlined>
              Download System Report
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

