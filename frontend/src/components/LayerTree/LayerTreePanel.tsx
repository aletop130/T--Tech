'use client';

import { useLayerManagerStore } from '@/lib/store/layerManager';
import { LayerSearchBar } from './LayerSearchBar';
import { LayerTreeNode } from './LayerTreeNode';

export function LayerTreePanel() {
  const nodes = useLayerManagerStore((s) => s.nodes);
  const rootIds = useLayerManagerStore((s) => s.rootIds);
  const searchQuery = useLayerManagerStore((s) => s.searchQuery);

  // Filter nodes by search query
  const matchesSearch = (nodeId: string): boolean => {
    if (!searchQuery) return true;
    const node = nodes[nodeId];
    if (!node) return false;
    const q = searchQuery.toLowerCase();
    if (node.label.toLowerCase().includes(q)) return true;
    // Check children
    return node.children.some((cid) => matchesSearch(cid));
  };

  const visibleRoots = rootIds.filter((id) => matchesSearch(id));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#080808]">
      <LayerSearchBar />
      <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
        {visibleRoots.map((rootId) => {
          const node = nodes[rootId];
          if (!node) return null;
          return <LayerTreeNode key={rootId} node={node} depth={0} />;
        })}
        {visibleRoots.length === 0 && (
          <div className="px-3 py-4 text-center font-code text-[10px] text-zinc-600">
            No matching layers
          </div>
        )}
      </div>
    </div>
  );
}
