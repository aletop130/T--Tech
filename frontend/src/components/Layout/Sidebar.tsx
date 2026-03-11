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
  colorVar: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    id: 'core',
    label: 'CORE',
    items: [
      { icon: 'dashboard', label: 'Dashboard', href: '/dashboard', colorVar: '--sda-accent-blue' },
      { icon: 'globe', label: 'Map', href: '/map', colorVar: '--sda-accent-cyan' },
      { icon: 'build', label: 'Sandbox', href: '/sandbox', colorVar: '#f59e0b' },
      { icon: 'search-around', label: 'Explorer', href: '/explorer', colorVar: '--sda-accent-green' },
      { icon: 'graph', label: 'Graph', href: '/graph', colorVar: '#a371f7' },
    ],
  },
  {
    id: 'operations',
    label: 'OPERATIONS',
    items: [
      { icon: 'warning-sign', label: 'Incidents', href: '/incidents', colorVar: '--sda-accent-red' },
      { icon: 'route', label: 'Detour', href: '/detour', colorVar: '#f78166' },
      { icon: 'flows', label: 'Operations', href: '/operations', colorVar: '--sda-accent-blue' },
    ],
  },
  {
    id: 'intelligence',
    label: 'INTELLIGENCE',
    items: [
      { icon: 'shield', label: 'Threats & Intel', href: '/threats', colorVar: '#ff6b6b' },
      { icon: 'rocket-slant', label: 'Events', href: '/events', colorVar: '#69db7c' },
      { icon: 'flash', label: 'Environment', href: '/environment', colorVar: '#fcc419' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, collapsedSections, toggleSection } = useAppStore();

  return (
    <div
      className={classNames(
        'flex flex-col h-full bg-sda-bg-sidebar border-r border-sda-border-default',
        'transition-all duration-200',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-center h-16 px-4">
        <div className="flex items-center justify-center w-full">
          <img
            src={sidebarCollapsed ? "/logotelespazioSOLOLOGO.svg" : "/logotelespazioscritta.svg"}
            alt="Telespazio logo"
            className={sidebarCollapsed ? "h-8 w-auto object-contain" : "max-h-10 w-auto object-contain"}
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navGroups.map((group) => {
          const isCollapsed = collapsedSections[group.id] ?? false;

          return (
            <div key={group.id} className="mb-1">
              {/* Section Header - only show when sidebar is expanded */}
              {!sidebarCollapsed && (
                <button
                  onClick={() => toggleSection(group.id)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] font-semibold tracking-wider text-sda-text-secondary hover:text-sda-text-primary uppercase"
                >
                  <span>{group.label}</span>
                  <Icon icon={isCollapsed ? 'chevron-right' : 'chevron-down'} size={12} />
                </button>
              )}

              {/* Items */}
              {(!isCollapsed || sidebarCollapsed) && (
                <ul className="px-2">
                  {group.items.map((item) => {
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
                              isActive ? 'bg-sda-bg-tertiary' : ''
                            )}
                            style={{ color: 'var(--sda-text-primary)' }}
                          >
                            <Icon icon={item.icon} size={16} style={{ color: item.colorVar.startsWith('--') ? `var(${item.colorVar})` : item.colorVar }} />
                            {!sidebarCollapsed && (
                              <span className="text-sm">{item.label}</span>
                            )}
                          </Link>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sda-border-default">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-md hover:bg-sda-bg-tertiary"
          style={{ color: 'var(--sda-text-secondary)' }}
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
