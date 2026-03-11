'use client';

import { useState, Suspense, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, Tab, Icon, Card, Spinner } from '@blueprintjs/core';
import { IconName } from '@blueprintjs/icons';

export interface TabDefinition {
  id: string;
  title: string;
  component: ReactNode;
}

interface TabbedPageInnerProps {
  tabs: TabDefinition[];
  icon: IconName;
  title: string;
  color: string;
  tabsId: string;
  testId?: string;
  /** Whether to wrap content in a Card. Default true. */
  card?: boolean;
}

function TabbedPageInner({
  tabs,
  icon,
  title,
  color,
  tabsId,
  testId,
  card = true,
}: TabbedPageInnerProps) {
  const searchParams = useSearchParams();
  const validIds = tabs.map((t) => t.id);
  const paramTab = searchParams.get('tab');
  const initialTab = paramTab && validIds.includes(paramTab) ? paramTab : tabs[0].id;
  const [selectedTab, setSelectedTab] = useState(initialTab);

  const handleTabChange = (newTab: string) => {
    setSelectedTab(newTab);
    window.history.replaceState(null, '', `?tab=${newTab}`);
  };

  const content = (
    <>
      <Tabs id={tabsId} selectedTabId={selectedTab} onChange={handleTabChange} large>
        {tabs.map((t) => (
          <Tab key={t.id} id={t.id} title={t.title} />
        ))}
      </Tabs>
      <div className="flex-1 overflow-auto">
        {tabs.find((t) => t.id === selectedTab)?.component}
      </div>
    </>
  );

  return (
    <div className="h-full flex flex-col" data-testid={testId}>
      <div className="flex items-center gap-2 px-4 py-3">
        <Icon icon={icon} size={20} style={{ color }} />
        <h1 className="text-xl font-bold m-0" style={{ color }}>
          {title}
        </h1>
      </div>
      {card ? (
        <Card className="flex-1 flex flex-col overflow-hidden mx-4 mb-4">
          {content}
        </Card>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden mx-4 mb-4">
          {content}
        </div>
      )}
    </div>
  );
}

export interface TabbedPageProps extends TabbedPageInnerProps {}

export default function TabbedPage(props: TabbedPageProps) {
  return (
    <Suspense fallback={<Spinner />}>
      <TabbedPageInner {...props} />
    </Suspense>
  );
}
