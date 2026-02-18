// WRITE_TARGET="frontend/src/app/(main)/detour/page.tsx"
// WRITE_CONTENT_LENGTH=0
'use client';

import React, { useState, useEffect } from 'react';
import { Card, Tabs, Tab, Spinner, Callout } from '@blueprintjs/core';
import { ThreatList } from '@/components/Detour/ThreatList';
import { CollisionAnalyzer } from '@/components/Detour/CollisionAnalyzer';
import { ManeuverPlanner } from '@/components/Detour/ManeuverPlanner';
import { OrbitVisualizer } from '@/components/Detour/OrbitVisualizer';
import { OpsBriefPanel } from '@/components/Detour/OpsBriefPanel';
import { AgentChat } from '@/components/Detour/AgentChat';
import { DetourArchive } from '@/components/Detour/DetourArchive';
import { useDetourStore } from '@/lib/store/detour';

// Simple error boundary component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: any) {
    console.warn('ErrorBoundary caught an error', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Callout intent="danger" title="Something went wrong">
          {this.state.error?.message}
        </Callout>
      );
    }
    return this.props.children;
  }
}

export default function DetourPage() {
  const {
    selectedConjunction,
    isLoading,
    error,
    startAnalysis,
    subscribeToSession,
    activeAnalyses,
  } = useDetourStore();

  const [activeTab, setActiveTab] = useState<string>('analysis');
  const [sessionId, setSessionId] = useState<string | null>(null);

  // When a conjunction is selected, trigger analysis if not already started
  useEffect(() => {
    if (selectedConjunction && !sessionId) {
      (async () => {
        await startAnalysis(selectedConjunction);
        // Pick the newest session id from the store after startAnalysis
        const ids = Object.keys(activeAnalyses);
        if (ids.length > 0) {
          setSessionId(ids[ids.length - 1]);
        }
      })();
    }
  }, [selectedConjunction, startAnalysis, activeAnalyses, sessionId]);

  // Subscribe to SSE updates for the current session
  useEffect(() => {
    if (!sessionId) return undefined;
    const unsubscribe = subscribeToSession(sessionId, () => {});
    return unsubscribe;
  }, [sessionId, subscribeToSession]);

  const renderAnalysisTab = () => (
    <div className="grid gap-4 md:grid-cols-2">
      <CollisionAnalyzer />
      <OrbitVisualizer />
      <OpsBriefPanel />
      <AgentChat />
    </div>
  );

  const renderManeuversTab = () => <ManeuverPlanner />;

  const renderHistoryTab = () => <DetourArchive />;

  return (
    <ErrorBoundary>
      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 overflow-y-auto bg-sda-bg-secondary p-4 border-r border-sda-border-default">
          <ThreatList />
        </aside>

        {/* Main panel with tabs */}
        <main className="flex-1 overflow-y-auto p-4">
          <Tabs id="detour-tabs" selectedTabId={activeTab} onChange={(newTabId: string, _prevTabId?: string, _event?: any) => setActiveTab(newTabId)} large={false}>
            <Tab id="analysis" title="Analysis" panel={renderAnalysisTab()} />
            <Tab id="maneuvers" title="Maneuvers" panel={renderManeuversTab()} />
            <Tab id="history" title="History" panel={renderHistoryTab()} />
          </Tabs>
          {isLoading && <Spinner className="mt-4" />}
          {error && <Callout intent="danger" className="mt-4">{error}</Callout>}
        </main>
      </div>
    </ErrorBoundary>
  );
}
