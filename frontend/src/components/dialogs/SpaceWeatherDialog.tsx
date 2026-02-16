'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  Button,
  Classes,
  Spinner,
  Callout,
  Intent,
  Tag,
  ProgressBar,
} from '@blueprintjs/core';
import { api, SpaceWeatherEvent } from '@/lib/api';
import { format } from 'date-fns';

interface SpaceWeatherDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SpaceWeatherImpact {
  current_kp?: number;
  alerts: SpaceWeatherEvent[];
  affected_satellites: number;
  affected_stations: number;
  impact_score: number;
  forecast: Array<{
    time: string;
    kp_index: number;
    severity: string;
  }>;
}

export function SpaceWeatherDialog({ isOpen, onClose }: SpaceWeatherDialogProps) {
  const [loading, setLoading] = useState(false);
  const [impact, setImpact] = useState<SpaceWeatherImpact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadImpact();
    }
  }, [isOpen]);

  const loadImpact = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSpaceWeatherImpact(24);
      setImpact(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load space weather impact');
    } finally {
      setLoading(false);
    }
  };

  const getKpColor = (kp?: number) => {
    if (!kp) return 'gray';
    if (kp >= 5) return 'red';
    if (kp >= 4) return 'orange';
    if (kp >= 3) return 'yellow';
    return 'green';
  };

  const getSeverityIntent = (severity: string): Intent => {
    const map: Record<string, Intent> = {
      critical: Intent.DANGER,
      high: Intent.WARNING,
      moderate: Intent.WARNING,
      low: Intent.SUCCESS,
      info: Intent.PRIMARY,
    };
    return map[severity.toLowerCase()] || Intent.NONE;
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Space Weather Impact"
      className="bp6-dark"
      style={{ width: '700px' }}
    >
      <div className={Classes.DIALOG_BODY}>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size={40} />
          </div>
        ) : error ? (
          <Callout intent={Intent.DANGER}>{error}</Callout>
        ) : impact ? (
          <div className="space-y-4">
            {/* Current Status */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Current Conditions</h3>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-sda-text-secondary text-sm">Kp Index: </span>
                  <Tag
                    intent={impact.current_kp && impact.current_kp >= 5 ? Intent.DANGER : Intent.SUCCESS}
                    large
                  >
                    {impact.current_kp?.toFixed(1) || 'N/A'}
                  </Tag>
                </div>
                <div>
                  <span className="text-sda-text-secondary text-sm">Impact Score: </span>
                  <Tag intent={impact.impact_score > 7 ? Intent.DANGER : Intent.WARNING} large>
                    {impact.impact_score.toFixed(1)}/10
                  </Tag>
                </div>
              </div>
            </div>

            {/* Active Alerts */}
            {impact.alerts.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Active Alerts</h3>
                <div className="space-y-2">
                  {impact.alerts.map((alert) => (
                    <Callout
                      key={alert.id}
                      intent={getSeverityIntent(alert.severity)}
                      title={alert.event_type}
                    >
                      <div className="flex items-center justify-between">
                        <span>
                          {format(new Date(alert.start_time), 'PPpp')}
                          {alert.kp_index && ` - Kp: ${alert.kp_index.toFixed(1)}`}
                        </span>
                        <Tag intent={getSeverityIntent(alert.severity)}>
                          {alert.severity}
                        </Tag>
                      </div>
                    </Callout>
                  ))}
                </div>
              </div>
            )}

            {/* Impact Summary */}
            <div>
              <h3 className="text-lg font-semibold mb-2">Impact Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-sda-bg-tertiary p-3 rounded">
                  <div className="text-sda-text-secondary text-sm">Affected Satellites</div>
                  <div className="text-2xl font-bold">{impact.affected_satellites}</div>
                </div>
                <div className="bg-sda-bg-tertiary p-3 rounded">
                  <div className="text-sda-text-secondary text-sm">Affected Ground Stations</div>
                  <div className="text-2xl font-bold">{impact.affected_stations}</div>
                </div>
              </div>
            </div>

            {/* Forecast */}
            {impact.forecast && impact.forecast.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2">24h Forecast</h3>
                <div className="space-y-2">
                  {impact.forecast.map((fc, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="text-sm text-sda-text-secondary">
                          {format(new Date(fc.time), 'HH:mm')}
                        </div>
                        <ProgressBar
                          value={fc.kp_index / 9}
                          intent={fc.kp_index >= 5 ? Intent.DANGER : Intent.SUCCESS}
                          className="mt-1"
                        />
                      </div>
                      <Tag intent={getSeverityIntent(fc.severity)}>
                        Kp {fc.kp_index.toFixed(1)}
                      </Tag>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button onClick={onClose}>Close</Button>
          <Button intent="primary" onClick={loadImpact} loading={loading}>
            Refresh
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

