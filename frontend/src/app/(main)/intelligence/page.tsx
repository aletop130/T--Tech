'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { ThreatPanel } from '@/components/Threats/ThreatPanel';
import { FleetRiskPanel } from '@/components/Threats/FleetRiskPanel';
import { AdversaryPanel } from '@/components/Adversary/AdversaryPanel';
import { LaunchCorrelationPanel } from '@/components/Launch/LaunchCorrelationPanel';
import { ReentryDashboard } from '@/components/Reentry/ReentryDashboard';
import { ManeuverDetectionPanel } from '@/components/ManeuverAlertPanel/ManeuverDetectionPanel';
import { SpaceWeatherPanel } from '@/components/SpaceWeather/SpaceWeatherPanel';
import { RFSpectrumPanel } from '@/components/RFSpectrum/RFSpectrumPanel';

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
        { id: 'fleet-risk', title: 'Fleet Risk',    component: <FleetRiskPanel /> },
        { id: 'adversary',  title: 'Adversary',     component: <AdversaryPanel /> },
        { id: 'launches',   title: 'Launches',      component: <LaunchCorrelationPanel /> },
        { id: 'reentry',    title: 'Reentry',       component: <ReentryDashboard /> },
        { id: 'maneuvers',  title: 'Maneuvers',     component: <ManeuverDetectionPanel /> },
        { id: 'weather',    title: 'Space Weather', component: <SpaceWeatherPanel /> },
        { id: 'rf',         title: 'RF Spectrum',   component: <RFSpectrumPanel /> },
      ]}
    />
  );
}
