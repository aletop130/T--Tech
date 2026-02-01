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
      console.error('Search error:', error);
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
    <header className="h-14 bg-sda-bg-secondary border-b border-sda-border-default flex items-center px-4 gap-4">
      {/* Global Search */}
      <div className="flex-1 max-w-xl">
        <Popover
          content={searchResultsMenu}
          isOpen={searchResults.length > 0}
          position="bottom-left"
          minimal
          matchTargetWidth
        >
          <InputGroup
            placeholder="Search satellites, stations, incidents... (Ctrl+K)"
            leftIcon="search"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            rightElement={
              isSearching ? (
                <Button minimal loading />
              ) : searchQuery ? (
                <Button
                  minimal
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

      {/* Status Indicators */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-sda-accent-green animate-pulse" />
          <span className="text-sda-text-secondary">Systems Nominal</span>
        </div>
      </div>

      {/* Settings */}
      <Button minimal icon="cog" onClick={() => window.location.href = '/admin'} />
    </header>
  );
}

