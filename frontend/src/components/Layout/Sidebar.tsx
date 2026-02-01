'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, Tooltip } from '@blueprintjs/core';
import { IconName } from '@blueprintjs/icons';
import { useAppStore } from '@/lib/store';
import classNames from 'classnames';

interface NavItem {
  icon: IconName;
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { icon: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { icon: 'search-around', label: 'Explorer', href: '/explorer' },
  { icon: 'graph', label: 'Graph View', href: '/graph' },
  { icon: 'timeline-events', label: 'Timeline', href: '/timeline' },
  { icon: 'globe', label: 'Map', href: '/map' },
  { icon: 'warning-sign', label: 'Incidents', href: '/incidents' },
  { icon: 'import', label: 'Ingestion', href: '/ingestion' },
  { icon: 'cog', label: 'Admin', href: '/admin' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

  return (
    <div
      className={classNames(
        'flex flex-col h-full bg-sda-bg-secondary border-r border-sda-border-default',
        'transition-all duration-200',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-sda-border-default">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-sda-accent-cyan to-sda-accent-blue flex items-center justify-center">
            <Icon icon="satellite" size={16} className="text-white" />
          </div>
          {!sidebarCollapsed && (
            <span className="font-bold text-sda-text-primary">SDA</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Tooltip
                  content={item.label}
                  position="right"
                  disabled={!sidebarCollapsed}
                >
                  <Link
                    href={item.href}
                    className={classNames(
                      'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
                      'hover:bg-sda-bg-tertiary',
                      isActive
                        ? 'bg-sda-bg-tertiary text-sda-accent-cyan'
                        : 'text-sda-text-secondary'
                    )}
                  >
                    <Icon icon={item.icon} size={16} />
                    {!sidebarCollapsed && (
                      <span className="text-sm">{item.label}</span>
                    )}
                  </Link>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sda-border-default">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-md hover:bg-sda-bg-tertiary text-sda-text-secondary"
        >
          <Icon
            icon={sidebarCollapsed ? 'chevron-right' : 'chevron-left'}
            size={16}
          />
        </button>
      </div>
    </div>
  );
}

