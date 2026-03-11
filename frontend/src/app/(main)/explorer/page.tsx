'use client';

import TabbedPage from '@/components/Layout/TabbedPage';
import { ExplorerPanel } from '@/components/Explorer/ExplorerPanel';
import { NetworkGraphPanel } from '@/components/Graph/NetworkGraphPanel';
import { CountryDashboard } from '@/components/CountryDashboard/CountryDashboard';

export default function ExplorerPage() {
  return (
    <TabbedPage
      tabsId="explorer-tabs"
      icon="search-around"
      title="Explorer"
      color="var(--sda-accent-green)"
      testId="explorer-page"
      card={false}
      tabs={[
        { id: 'catalog',   title: 'Catalog',       component: <ExplorerPanel /> },
        { id: 'network',   title: 'Network Graph', component: <NetworkGraphPanel /> },
        { id: 'countries', title: 'Countries',     component: <CountryDashboard /> },
      ]}
    />
  );
}
