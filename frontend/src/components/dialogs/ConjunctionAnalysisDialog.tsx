'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  Button,
  Classes,
  FormGroup,
  HTMLSelect,
  Checkbox,
  NumericInput,
  Spinner,
  Intent,
  Callout,
} from '@blueprintjs/core';
import { api, Satellite } from '@/lib/api';

interface ConjunctionAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: (result: any) => void;
}

export function ConjunctionAnalysisDialog({
  isOpen,
  onClose,
  onComplete,
}: ConjunctionAnalysisDialogProps) {
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedSatellites, setSelectedSatellites] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [timeWindow, setTimeWindow] = useState(24);
  const [minDistance, setMinDistance] = useState(1.0);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && satellites.length === 0) {
      loadSatellites();
    }
  }, [isOpen]);

  const loadSatellites = async () => {
    setLoading(true);
    try {
      const data = await api.getSatellites({ page_size: 100, is_active: true });
      setSatellites(data.items);
    } catch (err) {
      setError('Failed to load satellites');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedSatellites(satellites.map((s) => s.id));
    } else {
      setSelectedSatellites([]);
    }
  };

  const handleSatelliteToggle = (satelliteId: string, checked: boolean) => {
    if (checked) {
      setSelectedSatellites([...selectedSatellites, satelliteId]);
    } else {
      setSelectedSatellites(selectedSatellites.filter((id) => id !== satelliteId));
    }
  };

  const handleRun = async () => {
    if (selectedSatellites.length === 0 && !selectAll) {
      setError('Please select at least one satellite');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const analysisResult = await api.runConjunctionAnalysis({
        satellite_ids: selectAll ? undefined : selectedSatellites,
        time_window_hours: timeWindow,
        min_distance_km: minDistance,
      });

      setResult(analysisResult);
      if (onComplete) {
        onComplete(analysisResult);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to run conjunction analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Run Conjunction Analysis"
      className="bp6-dark"
      style={{ width: '600px' }}
    >
      <div className={Classes.DIALOG_BODY}>
        {error && (
          <Callout intent={Intent.DANGER} className="mb-4">
            {error}
          </Callout>
        )}

        {result ? (
          <div>
            <Callout intent={Intent.SUCCESS} className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Analysis Complete</h3>
              <p>
                Found <strong>{result.conjunctions_found || 0}</strong> potential conjunctions
                in the next {timeWindow} hours.
              </p>
            </Callout>
            <Button
              intent="primary"
              fill
              onClick={() => {
                setResult(null);
                onClose();
              }}
            >
              Close
            </Button>
          </div>
        ) : (
          <>
            <FormGroup label="Select Satellites">
              {loading ? (
                <Spinner size={20} />
              ) : (
                <div className="space-y-2 max-h-60 overflow-auto">
                  <Checkbox
                    checked={selectAll}
                    onChange={(e) => handleSelectAll(e.currentTarget.checked)}
                    label="Select All Active Satellites"
                  />
                  <div className="border-t border-sda-border-default pt-2">
                    {satellites.map((sat) => (
                      <Checkbox
                        key={sat.id}
                        checked={selectedSatellites.includes(sat.id) || selectAll}
                        onChange={(e) =>
                          handleSatelliteToggle(sat.id, e.currentTarget.checked)
                        }
                        disabled={selectAll}
                        label={`${sat.name} (NORAD ${sat.norad_id})`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </FormGroup>

            <FormGroup label="Time Window">
              <HTMLSelect
                value={timeWindow}
                onChange={(e) => setTimeWindow(Number(e.target.value))}
                fill
              >
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
                <option value={72}>72 hours</option>
              </HTMLSelect>
            </FormGroup>

            <FormGroup label="Minimum Distance (km)">
              <NumericInput
                value={minDistance}
                onValueChange={(value) => setMinDistance(value || 1.0)}
                min={0.1}
                stepSize={0.1}
                fill
              />
            </FormGroup>
          </>
        )}
      </div>

      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          {!result && (
            <>
              <Button onClick={onClose} disabled={analyzing}>
                Cancel
              </Button>
              <Button
                intent="primary"
                onClick={handleRun}
                loading={analyzing}
                disabled={analyzing || (selectedSatellites.length === 0 && !selectAll)}
              >
                Run Analysis
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

