'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Elevation,
  Icon,
  Button,
  Tag,
  HTMLSelect,
  Spinner,
  NonIdealState,
  Dialog,
  Classes,
  TextArea,
} from '@blueprintjs/core';
import { api, Incident } from '@/lib/api';
import { format } from 'date-fns';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getIncidents({
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
      });
      setIncidents(data.items);
    } catch (error) {
      console.error('Failed to load incidents:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const severityIntent = (severity: string) => {
    const intents: Record<string, any> = {
      critical: 'danger',
      high: 'warning',
      medium: 'warning',
      low: 'success',
      info: 'primary',
    };
    return intents[severity] || 'none';
  };

  const statusIntent = (status: string) => {
    const intents: Record<string, any> = {
      open: 'warning',
      investigating: 'primary',
      mitigating: 'primary',
      resolved: 'success',
      closed: 'none',
    };
    return intents[status] || 'none';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="warning-sign" className="text-sda-accent-yellow" />
          Incident Console
        </h1>
        <Button icon="add" intent="primary">
          Create Incident
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <HTMLSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="mitigating">Mitigating</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </HTMLSelect>

        <HTMLSelect
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </HTMLSelect>

        <div className="flex-1" />

        <Button icon="refresh" onClick={loadIncidents} />
      </div>

      {/* Incident List */}
      <Card elevation={Elevation.TWO} className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        ) : incidents.length === 0 ? (
          <NonIdealState
            icon="tick-circle"
            title="No incidents"
            description="All clear! No incidents match the current filters."
          />
        ) : (
          <div className="h-full overflow-auto">
            <div className="space-y-3 p-4">
              {incidents.map((incident) => (
                <Card
                  key={incident.id}
                  elevation={Elevation.ONE}
                  className="p-4 cursor-pointer hover:bg-sda-bg-tertiary transition-colors"
                  onClick={() => setSelectedIncident(incident)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Tag intent={severityIntent(incident.severity)} minimal>
                          {incident.severity.toUpperCase()}
                        </Tag>
                        <Tag intent={statusIntent(incident.status)} minimal>
                          {incident.status.toUpperCase()}
                        </Tag>
                        <Tag minimal className="capitalize">
                          {incident.incident_type.replace(/_/g, ' ')}
                        </Tag>
                      </div>
                      <h3 className="font-semibold text-sda-text-primary mb-1">
                        {incident.title}
                      </h3>
                      {incident.description && (
                        <p className="text-sm text-sda-text-secondary line-clamp-2">
                          {incident.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm text-sda-text-muted">
                      <div>
                        {format(new Date(incident.detected_at), 'MMM d, HH:mm')}
                      </div>
                      {incident.assigned_to && (
                        <div className="flex items-center gap-1 mt-1">
                          <Icon icon="user" size={12} />
                          {incident.assigned_to}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Incident Detail Dialog */}
      <Dialog
        isOpen={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
        title={selectedIncident?.title || ''}
        className="bp5-dark"
        style={{ width: 600 }}
      >
        {selectedIncident && (
          <div className={Classes.DIALOG_BODY}>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Tag intent={severityIntent(selectedIncident.severity)}>
                  {selectedIncident.severity.toUpperCase()}
                </Tag>
                <Tag intent={statusIntent(selectedIncident.status)}>
                  {selectedIncident.status.toUpperCase()}
                </Tag>
                <Tag className="capitalize">
                  {selectedIncident.incident_type.replace(/_/g, ' ')}
                </Tag>
              </div>

              <div>
                <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                  Description
                </h4>
                <p className="text-sda-text-primary">
                  {selectedIncident.description || 'No description provided'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                    Detected
                  </h4>
                  <p>
                    {format(new Date(selectedIncident.detected_at), 'PPpp')}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                    Priority
                  </h4>
                  <p>{selectedIncident.priority}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-sda-text-secondary mb-2">
                  Actions
                </h4>
                <div className="flex gap-2">
                  <Button
                    icon="endorsed"
                    intent="success"
                    onClick={() => {
                      // Update status
                    }}
                  >
                    Acknowledge
                  </Button>
                  <Button icon="user" outlined>
                    Assign
                  </Button>
                  <Button icon="chat" outlined>
                    Comment
                  </Button>
                  <Button icon="lightbulb" outlined>
                    Ask AI
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

