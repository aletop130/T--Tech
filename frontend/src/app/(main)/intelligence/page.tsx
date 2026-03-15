'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { ThreatPanel } from '@/components/Threats/ThreatPanel';
import { LaunchCorrelationPanel } from '@/components/Launch/LaunchCorrelationPanel';
import { ReentryDashboard } from '@/components/Reentry/ReentryDashboard';
import { ManeuverDetectionPanel } from '@/components/ManeuverAlertPanel/ManeuverDetectionPanel';

export default function IntelligencePage() {
  return (
    <TabbedPage
      tabsId="intelligence-tabs"
      icon="shield"
      title="Intelligence"
      color="#ff6b6b"
      testId="intelligence-page"
      tabs={[
        { id: 'detection',  title: 'Detection',     component: <ThreatPanel /> },
        { id: 'launches',   title: 'Launches',      component: <LaunchCorrelationPanel /> },
        { id: 'reentry',    title: 'Reentry',       component: <ReentryDashboard /> },
        { id: 'maneuvers',  title: 'Maneuvers',     component: <ManeuverDetectionPanel /> },
      ]}
    />
  );
}
