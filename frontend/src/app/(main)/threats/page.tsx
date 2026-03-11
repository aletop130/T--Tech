'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { ThreatPanel } from '@/components/Threats/ThreatPanel';
import { FleetRiskPanel } from '@/components/Threats/FleetRiskPanel';
import { AdversaryPanel } from '@/components/Adversary/AdversaryPanel';

export default function ThreatsPage() {
  return (
    <TabbedPage
      tabsId="threats-tabs"
      icon="shield"
      title="Threats & Intelligence"
      color="#e74c3c"
      testId="threats-page"
      tabs={[
        { id: 'detection', title: 'Detection', component: <ThreatPanel /> },
        { id: 'fleet-risk', title: 'Fleet Risk', component: <FleetRiskPanel /> },
        { id: 'adversary', title: 'Adversary', component: <AdversaryPanel /> },
      ]}
    />
  );
}
