'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Spinner, Tag, InputGroup, Button, Callout, Icon } from '@blueprintjs/core';
import type { AdversaryCatalogEntry, IntelligenceReport } from '@/types/threats';
import { useAdversaryStore } from '@/lib/stores/adversaryStore';
import { api } from '@/lib/api';

interface ManeuverEntry {
  id: string;
  maneuver_type: string;
  detection_time: string;
  delta_a_km: number;
  estimated_delta_v_ms: number;
  confidence: number;
}

function ManeuverTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    orbit_raise: 'arrow-up',
    orbit_lower: 'arrow-down',
    plane_change: 'pivot',
    station_keeping: 'refresh',
    deorbit: 'download',
  };
  return <Icon icon={(icons[type] || 'dot') as any} size={12} />;
}

export function AdversaryPanel() {
  const [catalog, setCatalog] = useState<AdversaryCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSat, setSelectedSat] = useState<string | null>(null);
  const [intel, setIntel] = useState<IntelligenceReport | null>(null);
  const [maneuvers, setManeuvers] = useState<ManeuverEntry[]>([]);
  const [maneuversLoading, setManeuversLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const { getResearch, appendChatMessage } = useAdversaryStore();
  const autoLoaded = useRef(false);

  const fetchCatalog = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getAdversaryCatalog();
      setCatalog(data);
      return data;
    } catch (e) {
      console.error('Failed to fetch adversary catalog:', e);
      setError(e instanceof Error ? e.message : 'Failed to load adversary catalog');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog().then((data) => {
      // Auto-load first satellite intel on mount
      if (!autoLoaded.current && data.length > 0) {
        autoLoaded.current = true;
        loadIntelligence(data[0].satellite_id);
      }
    });
  }, [fetchCatalog]);

  async function loadIntelligence(satId: string) {
    setSelectedSat(satId);
    setManeuvers([]);
    try {
      const [intelData, maneuverData] = await Promise.allSettled([
        api.getAdversaryIntelligence(satId),
        api.getAdversaryManeuvers(satId),
      ]);
      if (intelData.status === 'fulfilled') setIntel(intelData.value);
      if (maneuverData.status === 'fulfilled') {
        setManeuvers(maneuverData.value.maneuvers || []);
      }
    } catch (e) {
      console.error('Failed to fetch intelligence:', e);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !selectedSat) return;
    const message = chatInput;
    setChatInput('');
    appendChatMessage(selectedSat, { role: 'user', content: message });

    try {
      const data = await api.chatAboutAdversary(selectedSat, message);
      appendChatMessage(selectedSat, { role: 'assistant', content: data.reply });
    } catch (e) {
      appendChatMessage(selectedSat, { role: 'assistant', content: 'Error: failed to get response' });
    }
  }

  if (loading) return <div className="p-4"><Spinner size={20} /> Loading adversary catalog...</div>;

  if (error) return (
    <div className="p-4">
      <Callout intent="danger" title="Failed to load adversary catalog">
        {error}
        <div className="mt-2">
          <Button small intent="primary" onClick={fetchCatalog}>Retry</Button>
        </div>
      </Callout>
    </div>
  );

  const research = selectedSat ? getResearch(selectedSat) : null;

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--sda-text-primary)' }}>
        Adversary Satellite Tracking
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Catalog */}
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--sda-text-secondary)' }}>
            Catalog ({catalog.length} satellites)
          </h3>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {catalog.map(s => (
              <Card
                key={s.satellite_id}
                className="p-2 cursor-pointer"
                style={{
                  backgroundColor: selectedSat === s.satellite_id ? 'var(--sda-bg-tertiary)' : 'var(--sda-bg-secondary)',
                }}
                onClick={() => loadIntelligence(s.satellite_id)}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--sda-text-primary)' }}>{s.name}</span>
                  <div className="flex gap-1">
                    <Tag minimal>{s.country}</Tag>
                    {s.faction && <Tag minimal intent={s.faction === 'enemy' ? 'danger' : 'none'} style={{ fontSize: '9px' }}>{s.faction}</Tag>}
                  </div>
                </div>
                <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
                  NORAD {s.norad_id} | Alt: {s.altitude_km.toFixed(0)} km | Inc: {s.inclination_deg.toFixed(1)}°
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Intelligence + Maneuvers + Chat */}
        <div>
          {intel && (
            <div>
              <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--sda-text-secondary)' }}>
                Intelligence: {intel.satellite_name}
              </h3>
              <Card className="p-3 mb-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
                <div className="text-xs space-y-1" style={{ color: 'var(--sda-text-primary)' }}>
                  <div><strong>Threat Level:</strong> <Tag minimal intent={intel.threat_level === 'high' ? 'danger' : intel.threat_level === 'medium' ? 'warning' : 'success'}>{intel.threat_level}</Tag></div>
                  <div><strong>Country:</strong> {intel.country}</div>
                  <div><strong>Assessment:</strong> {intel.risk_assessment}</div>
                  {intel.capabilities && intel.capabilities.length > 0 && (
                    <div>
                      <strong>Capabilities:</strong>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {intel.capabilities.map((c, i) => (
                          <Tag key={i} minimal style={{ fontSize: '10px' }}>{c}</Tag>
                        ))}
                      </div>
                    </div>
                  )}
                  {intel.historical_precedents.length > 0 && (
                    <div>
                      <strong>Precedents:</strong>
                      <ul className="list-disc ml-4 mt-1">
                        {intel.historical_precedents.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>

              {/* Cross-panel: Recent Maneuvers */}
              {maneuvers.length > 0 && (
                <Card className="p-3 mb-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--sda-text-secondary)' }}>
                    <Icon icon="changes" size={12} /> Detected Maneuvers ({maneuvers.length})
                  </div>
                  <div className="space-y-1">
                    {maneuvers.slice(0, 5).map(m => (
                      <div key={m.id} className="flex justify-between items-center text-xs p-1 rounded" style={{ backgroundColor: 'var(--sda-bg-tertiary)' }}>
                        <div className="flex items-center gap-1">
                          <ManeuverTypeIcon type={m.maneuver_type} />
                          <span style={{ color: 'var(--sda-text-primary)' }}>
                            {m.maneuver_type.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span style={{ color: 'var(--sda-text-secondary)' }}>
                            {Math.abs(m.delta_a_km).toFixed(1)} km | {m.estimated_delta_v_ms.toFixed(1)} m/s
                          </span>
                          <Tag minimal intent={m.confidence > 0.7 ? 'danger' : 'warning'} style={{ fontSize: '9px' }}>
                            {(m.confidence * 100).toFixed(0)}%
                          </Tag>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Chat */}
              <div className="space-y-2 max-h-48 overflow-y-auto mb-2">
                {research?.chatMessages.map((msg, i) => (
                  <div key={i} className={`text-xs p-2 rounded ${msg.role === 'user' ? 'bg-blue-900/30' : 'bg-gray-800/50'}`}>
                    <strong>{msg.role === 'user' ? 'You' : 'Analyst'}:</strong> {msg.content}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <InputGroup
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                  placeholder="Ask about this satellite..."
                  small
                  fill
                />
                <Button small onClick={sendChat}>Send</Button>
              </div>
            </div>
          )}
          {!intel && (
            <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>
              Select a satellite to view intelligence
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
