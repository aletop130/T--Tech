'use client';

import { Icon } from '@blueprintjs/core';
import type { LayerNode } from '@/lib/store/layerManager';
import { useLayerManagerStore } from '@/lib/store/layerManager';

interface Props {
  node: LayerNode;
  depth: number;
}

export function LayerTreeNode({ node, depth }: Props) {
  const toggleVisibility = useLayerManagerStore((s) => s.toggleVisibility);
  const toggleExpanded = useLayerManagerStore((s) => s.toggleExpanded);
  const nodes = useLayerManagerStore((s) => s.nodes);

  const isGroup = node.type === 'group';
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className="flex items-center gap-1 py-1 pr-2 transition-colors hover:bg-zinc-900/40"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {/* Expand chevron */}
        {isGroup && hasChildren ? (
          <button
            className="flex h-4 w-4 items-center justify-center text-zinc-600"
            onClick={() => toggleExpanded(node.id)}
          >
            <Icon
              icon={node.expanded ? 'chevron-down' : 'chevron-right'}
              size={10}
            />
          </button>
        ) : (
          <span className="h-4 w-4" />
        )}

        {/* Visibility checkbox */}
        <button
          className="flex h-4 w-4 items-center justify-center border transition-colors"
          style={{
            borderColor: node.visible ? node.color + '80' : '#333',
            backgroundColor: node.visible ? node.color + '20' : 'transparent',
          }}
          onClick={() => toggleVisibility(node.id)}
        >
          {node.visible && (
            <span
              className="h-1.5 w-1.5"
              style={{ backgroundColor: node.color }}
            />
          )}
        </button>

        {/* Icon */}
        <Icon
          icon={node.icon as any}
          size={11}
          className="ml-0.5"
          style={{ color: node.visible ? node.color : '#555' }}
        />

        {/* Label */}
        <span
          className={`min-w-0 flex-1 truncate font-code text-[10px] uppercase tracking-wider ${
            node.visible ? 'text-zinc-300' : 'text-zinc-600'
          } ${isGroup ? 'font-semibold' : ''}`}
        >
          {node.label}
        </span>

        {/* Count badge */}
        {node.entityCount > 0 && (
          <span
            className="flex-shrink-0 border px-1 py-0 font-code text-[9px] tabular-nums"
            style={{
              borderColor: node.color + '30',
              color: node.color,
            }}
          >
            {node.entityCount}
          </span>
        )}
      </div>

      {/* Children (if expanded) */}
      {isGroup && node.expanded &&
        node.children.map((childId) => {
          const child = nodes[childId];
          if (!child) return null;
          return <LayerTreeNode key={childId} node={child} depth={depth + 1} />;
        })}
    </>
  );
}
