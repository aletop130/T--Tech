'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  Elevation,
  Icon,
  Tag,
  ProgressBar,
  Button,
} from '@blueprintjs/core';
import { api, IncidentStats, ConjunctionEvent, SpaceWeatherEvent } from '@/lib/api';
import { format } from 'date-fns';
import Link from 'next/link';
import { ConjunctionAnalysisDialog } from '@/components/dialogs/ConjunctionAnalysisDialog';
import { SpaceWeatherDialog } from '@/components/dialogs/SpaceWeatherDialog';
import { CreateIncidentDialog } from '@/components/dialogs/CreateIncidentDialog';
import { UploadTLEDialog } from '@/components/dialogs/UploadTLEDialog';

interface DashboardData {
  incidentStats: IncidentStats | null;
  conjunctions: ConjunctionEvent[];
  weatherEvents: SpaceWeatherEvent[];
  satelliteCount: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    incidentStats: null,
    conjunctions: [],
    weatherEvents: [],
    satelliteCount: 0,
  });
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [conjunctionDialogOpen, setConjunctionDialogOpen] = useState(false);
  const [weatherDialogOpen, setWeatherDialogOpen] = useState(false);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const loadData = async () => {
    try {
      const [stats, conjunctions, weather, satellites] = await Promise.all([
        api.getIncidentStats(),
        api.getConjunctions({ page_size: 5, is_actionable: true }),
        api.getSpaceWeatherEvents({ page_size: 5 }),
        api.getSatellites({ page_size: 1 }),
      ]);

      setData({
        incidentStats: stats,
        conjunctions: conjunctions.items,
        weatherEvents: weather.items,
        satelliteCount: satellites.total,
      });
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const severityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-sda-accent-red',
      high: 'bg-sda-accent-yellow',
      medium: 'bg-sda-accent-yellow',
      low: 'bg-sda-accent-green',
      info: 'bg-sda-accent-blue',
    };
    return colors[severity] || colors.info;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-sda-text-primary">
          Space Domain Awareness Dashboard
        </h1>
        <div className="text-sm text-sda-text-secondary">
          Last updated: {format(new Date(), 'PPp')}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card elevation={Elevation.TWO} className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-sda-accent-cyan/20 flex items-center justify-center">
              <Icon icon="satellite" size={24} className="text-sda-accent-cyan" />
            </div>
            <div>
              <div className="text-sm text-sda-text-secondary">Tracked Objects</div>
              <div className="text-2xl font-bold">{data.satelliteCount}</div>
            </div>
          </div>
        </Card>

        <Card elevation={Elevation.TWO} className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-sda-accent-yellow/20 flex items-center justify-center">
              <Icon icon="warning-sign" size={24} className="text-sda-accent-yellow" />
            </div>
            <div>
              <div className="text-sm text-sda-text-secondary">Open Incidents</div>
              <div className="text-2xl font-bold">
                {data.incidentStats?.open_count || 0}
              </div>
            </div>
          </div>
        </Card>

        <Card elevation={Elevation.TWO} className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-sda-accent-red/20 flex items-center justify-center">
              <Icon icon="error" size={24} className="text-sda-accent-red" />
            </div>
            <div>
              <div className="text-sm text-sda-text-secondary">Critical Events</div>
              <div className="text-2xl font-bold">
                {data.incidentStats?.critical_count || 0}
              </div>
            </div>
          </div>
        </Card>

        <Card elevation={Elevation.TWO} className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-sda-accent-green/20 flex items-center justify-center">
              <Icon icon="tick-circle" size={24} className="text-sda-accent-green" />
            </div>
            <div>
              <div className="text-sm text-sda-text-secondary">System Health</div>
              <div className="text-2xl font-bold text-sda-accent-green">
                Nominal
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actionable Conjunctions */}
        <Card elevation={Elevation.TWO} className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Icon icon="intersection" className="text-sda-accent-yellow" />
              Actionable Conjunctions
            </h2>
            <Link href="/explorer?type=conjunction">
              <Button minimal rightIcon="arrow-right">
                View All
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {data.conjunctions.length === 0 ? (
              <div className="text-sda-text-secondary text-center py-8">
                No actionable conjunctions
              </div>
            ) : (
              data.conjunctions.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 bg-sda-bg-tertiary rounded-lg"
                >
                  <div>
                    <div className="text-sm font-medium">
                      TCA: {format(new Date(event.tca), 'MMM d, HH:mm')} UTC
                    </div>
                    <div className="text-xs text-sda-text-secondary">
                      Miss: {event.miss_distance_km.toFixed(3)} km
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag
                      className={severityColor(event.risk_level)}
                      minimal
                    >
                      {event.risk_level.toUpperCase()}
                    </Tag>
                    <Button minimal icon="chevron-right" />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Space Weather */}
        <Card elevation={Elevation.TWO} className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Icon icon="flash" className="text-sda-accent-orange" />
              Space Weather Events
            </h2>
            <Link href="/explorer?type=space_weather">
              <Button minimal rightIcon="arrow-right">
                View All
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {data.weatherEvents.length === 0 ? (
              <div className="text-sda-text-secondary text-center py-8">
                No recent space weather events
              </div>
            ) : (
              data.weatherEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 bg-sda-bg-tertiary rounded-lg"
                >
                  <div>
                    <div className="text-sm font-medium capitalize">
                      {event.event_type.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-sda-text-secondary">
                      {format(new Date(event.start_time), 'MMM d, HH:mm')} UTC
                      {event.kp_index && ` • Kp: ${event.kp_index}`}
                    </div>
                  </div>
                  <Tag
                    className={severityColor(event.severity)}
                    minimal
                  >
                    {event.severity.toUpperCase()}
                  </Tag>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Incident Status */}
        <Card elevation={Elevation.TWO} className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Icon icon="th-list" className="text-sda-accent-blue" />
              Incident Status
            </h2>
            <Link href="/incidents">
              <Button minimal rightIcon="arrow-right">
                View All
              </Button>
            </Link>
          </div>

          {data.incidentStats && (
            <div className="space-y-4">
              {Object.entries(data.incidentStats.by_status).map(([status, count]) => (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{status}</span>
                    <span>{count}</span>
                  </div>
                  <ProgressBar
                    value={count / (data.incidentStats?.total || 1)}
                    stripes={status === 'investigating'}
                    animate={status === 'investigating'}
                    intent={
                      status === 'open'
                        ? 'warning'
                        : status === 'resolved'
                        ? 'success'
                        : 'primary'
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Quick Actions */}
        <Card elevation={Elevation.TWO} className="p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Icon icon="lightning" className="text-sda-accent-purple" />
            Quick Actions
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <Button
              icon="satellite"
              className="justify-start"
              outlined
              onClick={() => setConjunctionDialogOpen(true)}
            >
              Run Conjunction Analysis
            </Button>
            <Button
              icon="cloud"
              className="justify-start"
              outlined
              onClick={() => setWeatherDialogOpen(true)}
            >
              Check Space Weather
            </Button>
            <Button
              icon="issue-new"
              className="justify-start"
              outlined
              onClick={() => setIncidentDialogOpen(true)}
            >
              Create Incident
            </Button>
            <Button
              icon="import"
              className="justify-start"
              outlined
              onClick={() => setUploadDialogOpen(true)}
            >
              Upload TLE Data
            </Button>
          </div>
        </Card>
      </div>

      {/* Dialogs */}
      <ConjunctionAnalysisDialog
        isOpen={conjunctionDialogOpen}
        onClose={() => setConjunctionDialogOpen(false)}
        onComplete={() => {
          // Reload data after analysis
          loadData();
        }}
      />
      <SpaceWeatherDialog
        isOpen={weatherDialogOpen}
        onClose={() => setWeatherDialogOpen(false)}
      />
      <CreateIncidentDialog
        isOpen={incidentDialogOpen}
        onClose={() => setIncidentDialogOpen(false)}
        onCreated={() => {
          // Reload data after incident creation
          loadData();
        }}
      />
      <UploadTLEDialog
        isOpen={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploaded={() => {
          // Reload data after upload
          loadData();
        }}
      />
    </div>
  );
}

