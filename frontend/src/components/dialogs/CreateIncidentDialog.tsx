'use client';

import { useState } from 'react';
import {
  Dialog,
  Button,
  Classes,
  FormGroup,
  InputGroup,
  TextArea,
  HTMLSelect,
  Intent,
  Callout,
} from '@blueprintjs/core';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface CreateIncidentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (incidentId: string) => void;
}

export function CreateIncidentDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateIncidentDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [incidentType, setIncidentType] = useState('anomaly');
  const [severity, setSeverity] = useState('medium');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const incident = await api.createIncident({
        title: title.trim(),
        description: description.trim() || undefined,
        incident_type: incidentType,
        severity,
      });

      if (onCreated) {
        onCreated(incident.id);
      }

      // Reset form
      setTitle('');
      setDescription('');
      setIncidentType('anomaly');
      setSeverity('medium');

      onClose();

      // Navigate to incident
      router.push(`/incidents`);
    } catch (err: any) {
      setError(err.message || 'Failed to create incident');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (!creating) {
      setTitle('');
      setDescription('');
      setIncidentType('anomaly');
      setSeverity('medium');
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Incident"
      className="bp5-dark"
      style={{ width: '600px' }}
    >
      <div className={Classes.DIALOG_BODY}>
        {error && (
          <Callout intent={Intent.DANGER} className="mb-4">
            {error}
          </Callout>
        )}

        <FormGroup label="Title *" labelFor="incident-title">
          <InputGroup
            id="incident-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief description of the incident"
            fill
            disabled={creating}
          />
        </FormGroup>

        <FormGroup label="Description" labelFor="incident-description">
          <TextArea
            id="incident-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed description of the incident..."
            fill
            rows={4}
            disabled={creating}
          />
        </FormGroup>

        <FormGroup label="Incident Type" labelFor="incident-type">
          <HTMLSelect
            id="incident-type"
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            fill
            disabled={creating}
          >
            <option value="anomaly">Anomaly</option>
            <option value="conjunction_alert">Conjunction Alert</option>
            <option value="space_weather">Space Weather</option>
            <option value="rf_interference">RF Interference</option>
            <option value="ground_station_outage">Ground Station Outage</option>
            <option value="data_loss">Data Loss</option>
          </HTMLSelect>
        </FormGroup>

        <FormGroup label="Severity" labelFor="incident-severity">
          <HTMLSelect
            id="incident-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            fill
            disabled={creating}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </HTMLSelect>
        </FormGroup>
      </div>

      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button onClick={handleClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            intent="primary"
            onClick={handleSubmit}
            loading={creating}
            disabled={!title.trim() || creating}
          >
            Create Incident
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

