'use client';

import { useState, useEffect } from 'react';
import { Card, Tag, Button, Spinner, Icon, NonIdealState } from '@blueprintjs/core';
import { listArchivedAnalyses, ArchivedAnalysis } from '@/lib/api/detour';

const RISK_COLORS: Record<string, string> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

const STATUS_ICONS: Record<string, string> = {
  completed: 'tick-circle',
  cancelled: 'cross-circle',
  failed: 'warning-sign',
};

export function DetourArchive() {
  const [analyses, setAnalyses] = useState<ArchivedAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchAnalyses = async (pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await listArchivedAnalyses(pageNum, 20);
      setAnalyses(response.items);
      setTotal(response.total);
      setPage(pageNum);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load archives');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyses(1);
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (loading && analyses.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <NonIdealState
        icon="error"
        title="Error loading archives"
        description={error}
        action={
          <Button icon="refresh" onClick={() => fetchAnalyses(page)}>
            Retry
          </Button>
        }
      />
    );
  }

  if (analyses.length === 0) {
    return (
      <NonIdealState
        icon="history"
        title="No archived analyses"
        description="Completed Detour analyses will appear here for historical reference."
      />
    );
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Archived Analyses</h3>
        <Tag minimal>{total} total</Tag>
      </div>

      <div className="space-y-3">
        {analyses.map((analysis) => (
          <Card key={analysis.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Icon 
                    icon={(STATUS_ICONS[analysis.status] || 'circle') as any}
                    intent={analysis.status === 'completed' ? 'success' : 'warning'}
                  />
                  <span className="font-mono text-sm">{analysis.session_id}</span>
                  {analysis.final_risk_level && (
                    <Tag 
                      minimal 
                      intent={RISK_COLORS[analysis.final_risk_level] as 'none' | 'primary' | 'success' | 'warning' | 'danger'}
                    >
                      {analysis.final_risk_level}
                    </Tag>
                  )}
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-sda-text-muted">
                  <div>
                    <span className="block text-xs uppercase">Satellite</span>
                    <span className="text-sda-text-primary">{analysis.satellite_id}</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase">Conjunction</span>
                    <span className="text-sda-text-primary font-mono">{analysis.conjunction_event_id}</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase">Completed</span>
                    <span className="text-sda-text-primary">{formatDate(analysis.completed_at)}</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase">Executed</span>
                    <span className="text-sda-text-primary">
                      {analysis.was_executed ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>

                {analysis.steps_summary && analysis.steps_summary.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-sda-border-default">
                    <span className="text-xs text-sda-text-muted uppercase">Steps</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {analysis.steps_summary.map((step, idx) => (
                        <Tag 
                          key={idx} 
                          minimal 
                          intent={step.status === 'completed' ? 'success' : step.status === 'rejected' ? 'danger' : 'none'}
                        >
                          {step.agent}: {step.status}
                        </Tag>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 ml-4">
                <Button 
                  small 
                  icon="eye-open" 
                  onClick={() => {
                    // Could open a detail modal or navigate to detail page
                    console.log('View analysis:', analysis.id);
                  }}
                >
                  View
                </Button>
                <Button 
                  small 
                  icon="refresh"
                  onClick={() => {
                    // Could trigger reanalysis
                    console.log('Reanalyze:', analysis.id);
                  }}
                >
                  Reanalyze
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            icon="chevron-left"
            minimal
            disabled={page <= 1}
            onClick={() => fetchAnalyses(page - 1)}
          />
          <span className="text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            icon="chevron-right"
            minimal
            disabled={page >= totalPages}
            onClick={() => fetchAnalyses(page + 1)}
          />
        </div>
      )}
    </div>
  );
}
