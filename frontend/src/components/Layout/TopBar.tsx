'use client';

import { useState, useCallback } from 'react';
import {
  InputGroup,
  Button,
  Menu,
  MenuItem,
  Popover,
  Tag,
} from '@blueprintjs/core';
import { api, SearchResult } from '@/lib/api';
import { useRouter } from 'next/navigation';

export function TopBar() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await api.search(query);
      setSearchResults(results);
    } catch (error) {
      console.warn('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleResultClick = (result: SearchResult) => {
    setSearchQuery('');
    setSearchResults([]);
    router.push(`/explorer/${result.type}/${result.id}`);
  };

  const searchResultsMenu = searchResults.length > 0 ? (
    <Menu className="max-h-80 overflow-auto">
      {searchResults.map((result) => (
        <MenuItem
          key={`${result.type}-${result.id}`}
          text={
            <div className="flex items-center gap-2">
              <Tag minimal className="text-xs">
                {result.type}
              </Tag>
              <span>{result.name}</span>
              {result.norad_id && (
                <span className="text-sda-text-muted text-xs">
                  #{result.norad_id}
                </span>
              )}
            </div>
          }
          onClick={() => handleResultClick(result)}
        />
      ))}
    </Menu>
  ) : undefined;

  return (
    <header className="h-10 bg-sda-bg-secondary border-b border-sda-border-default flex items-center px-3 gap-3">
      {/* Global Search */}
      <div className="flex-1 max-w-md">
        <Popover
          content={searchResultsMenu}
          isOpen={searchResults.length > 0}
          position="bottom-left"
          minimal
          matchTargetWidth
        >
          <InputGroup
            placeholder="Search... (Ctrl+K)"
            leftIcon="search"
            small
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            rightElement={
              isSearching ? (
                <Button minimal loading small />
              ) : searchQuery ? (
                <Button
                  minimal
                  small
                  icon="cross"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                />
              ) : undefined
            }
          />
        </Popover>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* HORUS branding + status */}
      <div className="flex items-center gap-3 mr-2">
        <div className="flex items-center gap-2">
          <img
            src="/omniscient-logo.svg"
            alt="Horus logo"
            className="h-5 w-5 object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <span className="font-sans text-[13px] font-bold uppercase tracking-[0.15em] text-white">
            HORUS
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-sda-accent-green animate-pulse" />
          <span className="font-code text-[10px] uppercase tracking-wider text-zinc-400">
            STATUS NOMINAL
          </span>
        </div>
      </div>

      {/* Settings */}
      <Button minimal small icon="cog" onClick={() => window.location.href = '/admin'} />
    </header>
  );
}
