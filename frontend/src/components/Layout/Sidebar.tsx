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

const navItems: NavItem[] = [
  { icon: 'dashboard', label: 'Dashboard', href: '/dashboard', colorVar: '--sda-accent-blue' },
  { icon: 'search-around', label: 'Explorer', href: '/explorer', colorVar: '--sda-accent-green' },
  { icon: 'graph', label: 'Graph View', href: '/graph', colorVar: '#a371f7' },
  { icon: 'timeline-events', label: 'Timeline', href: '/timeline', colorVar: '--sda-accent-yellow' },
  { icon: 'globe', label: 'Map', href: '/map', colorVar: '--sda-accent-cyan' },
  { icon: 'warning-sign', label: 'Incidents', href: '/incidents', colorVar: '--sda-accent-red' },
  { icon: 'flows', label: 'Operations', href: '/operations', colorVar: '--sda-accent-blue' },
  { icon: 'route', label: 'Detour', href: '/detour', colorVar: '#f78166' },
  { icon: 'shield', label: 'Threats', href: '/threats', colorVar: '#ff6b6b' },
  { icon: 'pulse', label: 'Fleet Risk', href: '/fleet-risk', colorVar: '#ffd43b' },
  { icon: 'locate', label: 'Adversary', href: '/adversary', colorVar: '#ff922b' },
  { icon: 'satellite', label: 'Comms', href: '/comms', colorVar: '#74c0fc' },
  { icon: 'flash', label: 'Space Weather', href: '/space-weather', colorVar: '#fcc419' },
  { icon: 'flame', label: 'Reentry', href: '/reentry', colorVar: '#e64980' },
  { icon: 'rocket-slant', label: 'Launches', href: '/launches', colorVar: '#69db7c' },
  { icon: 'drive-time', label: 'Maneuvers', href: '/maneuvers', colorVar: '#da77f2' },
  { icon: 'flag', label: 'Countries', href: '/country-dashboard', colorVar: '#20c997' },
  { icon: 'cell-tower', label: 'RF Spectrum', href: '/rf-spectrum', colorVar: '#22d3ee' },
  { icon: 'import', label: 'Ingestion', href: '/ingestion', colorVar: '#8000ca' },
  { icon: 'cog', label: 'Admin', href: '/admin', colorVar: '#8b949e' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

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
                      isActive ? 'bg-sda-bg-tertiary' : ''
                    )}
                    style={{ color: 'var(--sda-text-primary)' }}
                  >
                    <Icon icon={item.icon} size={16} style={{ color: `var(${item.colorVar})` }} />
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

