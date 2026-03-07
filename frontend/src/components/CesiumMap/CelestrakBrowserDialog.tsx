'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Intent,
  InputGroup,
  Spinner,
  Callout,
  Tag,
  Tabs,
  Tab,
  Icon,
} from '@blueprintjs/core';
import { api } from '@/lib/api';

interface CelestrakBrowserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onFetched: () => void;
}

interface SatellitePreview {
  norad_id: number;
  name: string;
}

type SatAddState = 'idle' | 'loading' | 'added' | 'error';

const SatelliteRow: React.FC<{
  sat: SatellitePreview;
  state: SatAddState;
  onAdd: (noradId: number) => void;
  compact?: boolean;
}> = ({ sat, state, onAdd, compact }) => (
  <div className={`flex items-center gap-2 ${compact ? 'py-0.5 px-1' : 'py-1 px-2'} rounded group hover:bg-sda-bg-tertiary transition-colors`}>
    <span className={`text-sda-text-primary truncate flex-1 ${compact ? 'text-xs' : 'text-sm'}`}>{sat.name}</span>
    <code className={`text-sda-text-tertiary flex-shrink-0 font-mono ${compact ? 'text-[10px]' : 'text-xs'}`}>{sat.norad_id}</code>
    <button
      onClick={(e) => { e.stopPropagation(); if (state === 'idle' || state === 'error') onAdd(sat.norad_id); }}
      disabled={state === 'loading' || state === 'added'}
      className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all ${
        state === 'added'
          ? 'text-green-400 bg-green-500/10'
          : state === 'error'
          ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20 cursor-pointer'
          : state === 'loading'
          ? 'text-blue-400'
          : 'text-sda-text-tertiary opacity-0 group-hover:opacity-100 hover:text-blue-400 hover:bg-blue-500/10 cursor-pointer'
      }`}
    >
      {state === 'loading' ? (
        <Spinner size={12} />
      ) : state === 'added' ? (
        <Icon icon="tick" size={12} />
      ) : state === 'error' ? (
        <Icon icon="cross" size={12} />
      ) : (
        <Icon icon="plus" size={12} />
      )}
    </button>
  </div>
);

export const CelestrakBrowserDialog: React.FC<CelestrakBrowserDialogProps> = ({
  isOpen,
  onClose,
  onFetched,
}) => {
  // Browse state
  const [categories, setCategories] = useState<Record<string, Record<string, string>>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string>('');

  // Preview state
  const [previewSatellites, setPreviewSatellites] = useState<SatellitePreview[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SatellitePreview[]>([]);
  const [searchCount, setSearchCount] = useState(0);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch state
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ intent: Intent; message: string } | null>(null);

  // Per-satellite add state
  const [satStates, setSatStates] = useState<Map<number, SatAddState>>(new Map());

  // Loading groups
  const [loadingGroups, setLoadingGroups] = useState(false);

  const getSatState = useCallback((noradId: number): SatAddState => {
    return satStates.get(noradId) ?? 'idle';
  }, [satStates]);

  const handleAddSatellite = useCallback(async (noradId: number) => {
    setSatStates(prev => new Map(prev).set(noradId, 'loading'));
    try {
      const result = await api.fetchFromCelesTrack([noradId]);
      if (result.success) {
        setSatStates(prev => new Map(prev).set(noradId, 'added'));
        onFetched();
      } else {
        setSatStates(prev => new Map(prev).set(noradId, 'error'));
        setTimeout(() => setSatStates(prev => new Map(prev).set(noradId, 'idle')), 2000);
      }
    } catch {
      setSatStates(prev => new Map(prev).set(noradId, 'error'));
      setTimeout(() => setSatStates(prev => new Map(prev).set(noradId, 'idle')), 2000);
    }
  }, [onFetched]);

  useEffect(() => {
    if (isOpen && Object.keys(categories).length === 0) {
      setLoadingGroups(true);
      api.getCelestrakGroups()
        .then((res) => {
          setCategories(res.categories);
          const firstCat = Object.keys(res.categories)[0];
          if (firstCat) setSelectedCategory(firstCat);
        })
        .catch(() => {})
        .finally(() => setLoadingGroups(false));
    }
  }, [isOpen, categories]);

  const handleGroupClick = useCallback(async (groupId: string, groupName: string) => {
    setSelectedGroup(groupId);
    setSelectedGroupName(groupName);
    setPreviewSatellites([]);
    setPreviewCount(0);
    setFetchResult(null);
    setLoadingPreview(true);

    try {
      const result = await api.previewCelestrakGroup(groupId);
      setPreviewSatellites(result.satellites);
      setPreviewCount(result.count);
    } catch {
      setPreviewSatellites([]);
      setPreviewCount(0);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const handleFetchGroup = useCallback(async (group: string) => {
    setFetching(true);
    setFetchResult(null);

    try {
      const result = await api.fetchCelestrakGroup(group);
      if (result.success) {
        setFetchResult({
          intent: Intent.SUCCESS,
          message: `Created ${result.satellites_created}, updated ${result.satellites_updated} satellites`,
        });
        // Mark all preview satellites as added
        setSatStates(prev => {
          const next = new Map(prev);
          previewSatellites.forEach(s => next.set(s.norad_id, 'added'));
          return next;
        });
        onFetched();
      } else {
        setFetchResult({ intent: Intent.DANGER, message: result.message || 'Failed' });
      }
    } catch (err) {
      setFetchResult({
        intent: Intent.DANGER,
        message: err instanceof Error ? err.message : 'Fetch failed',
      });
    } finally {
      setFetching(false);
    }
  }, [onFetched, previewSatellites]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setFetchResult(null);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (query.length < 2) {
      setSearchResults([]);
      setSearchCount(0);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const result = await api.searchCelestrak(query);
        setSearchResults(result.satellites);
        setSearchCount(result.count);
      } catch {
        setSearchResults([]);
        setSearchCount(0);
      } finally {
        setLoadingSearch(false);
      }
    }, 300);
  }, []);

  const handleClose = () => {
    setSelectedGroup(null);
    setPreviewSatellites([]);
    setSearchQuery('');
    setSearchResults([]);
    setFetchResult(null);
    setSatStates(new Map());
    onClose();
  };

  const browsePanel = (
    <div className="flex h-[480px]">
      {/* Column 1: Categories */}
      <div className="w-36 flex-shrink-0 overflow-y-auto border-r border-sda-border-default pr-2">
        {loadingGroups ? (
          <div className="flex justify-center py-8"><Spinner size={20} /></div>
        ) : (
          Object.keys(categories).map((cat) => (
            <div
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setSelectedGroup(null);
                setPreviewSatellites([]);
                setFetchResult(null);
              }}
              className={`px-2 py-1 text-sm rounded cursor-pointer mb-0.5 transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-sda-text-secondary hover:bg-sda-bg-tertiary hover:text-sda-text-primary'
              }`}
            >
              {cat}
            </div>
          ))
        )}
      </div>

      {/* Column 2: Groups */}
      <div className="w-44 flex-shrink-0 overflow-y-auto border-r border-sda-border-default px-2">
        {selectedCategory && categories[selectedCategory] ? (
          Object.entries(categories[selectedCategory]).map(([gid, gname]) => (
            <div
              key={gid}
              onClick={() => handleGroupClick(gid, gname)}
              className={`px-2 py-1.5 text-sm rounded cursor-pointer mb-0.5 flex items-center justify-between transition-colors ${
                selectedGroup === gid
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-sda-text-secondary hover:bg-sda-bg-tertiary hover:text-sda-text-primary'
              }`}
            >
              <span>{gname}</span>
              {selectedGroup === gid && loadingPreview && <Spinner size={14} />}
            </div>
          ))
        ) : (
          <div className="text-sda-text-secondary text-sm py-4 text-center">
            Select a category
          </div>
        )}
      </div>

      {/* Column 3: Satellites */}
      <div className="flex-1 flex flex-col overflow-hidden pl-2">
        {selectedGroup && !loadingPreview && previewCount > 0 ? (
          <>
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <div className="text-sm text-sda-text-primary flex items-center gap-2">
                <span className="font-medium">{selectedGroupName}</span>
                <Tag intent={Intent.PRIMARY} minimal>{previewCount}</Tag>
              </div>
              <Button
                intent={Intent.SUCCESS}
                small
                loading={fetching}
                onClick={() => handleFetchGroup(selectedGroup)}
              >
                Fetch All
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {previewSatellites.map((s) => (
                <SatelliteRow key={s.norad_id} sat={s} state={getSatState(s.norad_id)} onAdd={handleAddSatellite} compact />
              ))}
            </div>
          </>
        ) : loadingPreview ? (
          <div className="flex justify-center items-center h-full">
            <Spinner size={24} />
          </div>
        ) : (
          <div className="text-sda-text-secondary text-sm text-center py-8">
            Select a group to see satellites
          </div>
        )}
      </div>
    </div>
  );

  const searchPanel = (
    <div className="h-[480px] flex flex-col">
      <InputGroup
        leftIcon="search"
        placeholder="Search satellite name (min 2 chars)..."
        value={searchQuery}
        onChange={(e) => handleSearch(e.target.value)}
        rightElement={loadingSearch ? <Spinner size={16} className="mr-2" /> : undefined}
        className="mb-2"
      />

      <div className="flex-1 overflow-y-auto">
        {searchResults.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-1">
              <Tag intent={Intent.PRIMARY} minimal>{searchCount} results</Tag>
              <Button
                intent={Intent.SUCCESS}
                small
                loading={fetching}
                onClick={async () => {
                  setFetching(true);
                  setFetchResult(null);
                  try {
                    const noradIds = searchResults.map(s => s.norad_id);
                    let totalCreated = 0;
                    let totalUpdated = 0;
                    for (let i = 0; i < noradIds.length; i += 100) {
                      const batch = noradIds.slice(i, i + 100);
                      const result = await api.fetchFromCelesTrack(batch);
                      totalCreated += result.satellites_created;
                      totalUpdated += result.satellites_updated;
                    }
                    setFetchResult({
                      intent: Intent.SUCCESS,
                      message: `Created ${totalCreated}, updated ${totalUpdated} satellites`,
                    });
                    // Mark all search results as added
                    setSatStates(prev => {
                      const next = new Map(prev);
                      searchResults.forEach(s => next.set(s.norad_id, 'added'));
                      return next;
                    });
                    onFetched();
                  } catch (err) {
                    setFetchResult({
                      intent: Intent.DANGER,
                      message: err instanceof Error ? err.message : 'Fetch failed',
                    });
                  } finally {
                    setFetching(false);
                  }
                }}
              >
                Fetch All Results
              </Button>
            </div>
            <div>
              {searchResults.map((s) => (
                <SatelliteRow key={s.norad_id} sat={s} state={getSatState(s.norad_id)} onAdd={handleAddSatellite} />
              ))}
            </div>
          </>
        ) : searchQuery.length >= 2 && !loadingSearch ? (
          <div className="text-sda-text-secondary text-sm text-center py-8">No results found</div>
        ) : (
          <div className="text-sda-text-secondary text-sm text-center py-8">
            Type a satellite name to search CelesTrak
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="CelesTrak Satellite Browser"
      className="bp6-dark"
      style={{ width: 950, paddingBottom: 0 }}
    >
      <DialogBody className="!pb-2">
        <Tabs id="celestrak-tabs" renderActiveTabPanelOnly>
          <Tab id="browse" title="Browse Groups" panel={browsePanel} />
          <Tab id="search" title="Search" panel={searchPanel} />
        </Tabs>

        {fetchResult && (
          <Callout intent={fetchResult.intent} className="mt-2" icon={fetchResult.intent === Intent.SUCCESS ? 'tick-circle' : 'error'}>
            {fetchResult.message}
          </Callout>
        )}
      </DialogBody>
      <DialogFooter
        actions={<Button onClick={handleClose}>Close</Button>}
      />
    </Dialog>
  );
};
