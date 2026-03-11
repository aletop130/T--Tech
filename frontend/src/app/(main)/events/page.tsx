'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { LaunchCorrelationPanel } from '@/components/Launch/LaunchCorrelationPanel';
import { ReentryDashboard } from '@/components/Reentry/ReentryDashboard';
import { ManeuverDetectionPanel } from '@/components/ManeuverAlertPanel/ManeuverDetectionPanel';

export default function EventsPage() {
  return (
    <TabbedPage
      tabsId="events-tabs"
      icon="rocket-slant"
      title="Events"
      color="#2ecc71"
      testId="events-page"
      tabs={[
        { id: 'launches', title: 'Launches', component: <LaunchCorrelationPanel /> },
        { id: 'reentry', title: 'Reentry', component: <ReentryDashboard /> },
        { id: 'maneuvers', title: 'Maneuvers', component: <ManeuverDetectionPanel /> },
      ]}
    />
  );
}
