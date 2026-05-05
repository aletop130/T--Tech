'use client';

import { InputGroup } from '@blueprintjs/core';
import { useLayerManagerStore } from '@/lib/store/layerManager';

export function LayerSearchBar() {
  const query = useLayerManagerStore((s) => s.searchQuery);
  const setQuery = useLayerManagerStore((s) => s.setSearchQuery);

  return (
    <div className="border-b border-[#1a1a1a] px-2 py-1.5">
      <InputGroup
        small
        leftIcon="search"
        placeholder="Filter layers..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="font-code text-[10px] [&_input]:!bg-[#0a0a0a] [&_input]:!text-zinc-300 [&_input]:!font-code [&_input]:!text-[10px]"
      />
    </div>
  );
}
