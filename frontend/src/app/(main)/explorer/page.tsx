'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Elevation,
  Icon,
  InputGroup,
  Button,
  Tag,
  HTMLSelect,
  Spinner,
  NonIdealState,
} from '@blueprintjs/core';
import { api, Satellite, GroundStation } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

type ObjectType = 'satellite' | 'ground_station' | 'sensor';

interface ObjectListItem {
  id: string;
  name: string;
  type: ObjectType;
  status: string;
  metadata: Record<string, any>;
}

export default function ExplorerPage() {
  const router = useRouter();
  
  const [objectType, setObjectType] = useState<ObjectType>('satellite');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<ObjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  
  const pageSize = 20;

  const loadObjects = useCallback(async () => {
    setLoading(true);
    try {
      let result: ObjectListItem[] = [];
      let totalCount = 0;

      if (objectType === 'satellite') {
        const data = await api.getSatellites({
          page,
          page_size: pageSize,
          search: searchQuery || undefined,
        });
        result = data.items.map((s) => ({
          id: s.id,
          name: s.name,
          type: 'satellite' as ObjectType,
          status: s.is_active ? 'active' : 'inactive',
          metadata: {
            norad_id: s.norad_id,
            object_type: s.object_type,
            country: s.country,
          },
        }));
        totalCount = data.total;
      } else if (objectType === 'ground_station') {
        const data = await api.getGroundStations({ page });
        result = data.items.map((gs) => ({
          id: gs.id,
          name: gs.name,
          type: 'ground_station' as ObjectType,
          status: gs.is_operational ? 'operational' : 'offline',
          metadata: {
            code: gs.code,
            country: gs.country,
            lat: gs.latitude,
            lon: gs.longitude,
          },
        }));
        totalCount = data.total;
      }

      setItems(result);
      setTotal(totalCount);
    } catch (error) {
      console.error('Failed to load objects:', error);
    } finally {
      setLoading(false);
    }
  }, [objectType, page, searchQuery]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  const handleObjectClick = (item: ObjectListItem) => {
    router.push(`/explorer/${item.type}/${item.id}`);
  };

  const statusColor = (status: string) => {
    if (status === 'active' || status === 'operational') return 'success';
    if (status === 'inactive' || status === 'offline') return 'danger';
    return 'none';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-sda-text-primary">
          Object Explorer
        </h1>
        <div className="flex items-center gap-3">
          <HTMLSelect
            value={objectType}
            onChange={(e) => {
              setObjectType(e.target.value as ObjectType);
              setPage(1);
            }}
          >
            <option value="satellite">Satellites</option>
            <option value="ground_station">Ground Stations</option>
            <option value="sensor">Sensors</option>
          </HTMLSelect>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <InputGroup
          placeholder="Search objects..."
          leftIcon="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadObjects()}
          className="flex-1"
        />
        <Button icon="filter" outlined>
          Filters
        </Button>
        <Button icon="refresh" onClick={loadObjects} />
      </div>

      {/* Object List */}
      <Card elevation={Elevation.TWO} className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <NonIdealState
            icon="search"
            title="No objects found"
            description="Try adjusting your search or filters"
          />
        ) : (
          <div className="h-full overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-sda-bg-secondary">
                <tr className="text-left text-sda-text-secondary text-sm">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                  <th className="px-4 py-3 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-sda-border-default hover:bg-sda-bg-tertiary cursor-pointer"
                    onClick={() => handleObjectClick(item)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-sda-text-primary">
                        {item.name}
                      </div>
                      {item.metadata.norad_id && (
                        <div className="text-xs text-sda-text-muted">
                          NORAD: {item.metadata.norad_id}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Tag minimal className="capitalize">
                        {item.type.replace(/_/g, ' ')}
                      </Tag>
                    </td>
                    <td className="px-4 py-3">
                      <Tag intent={statusColor(item.status)} minimal>
                        {item.status}
                      </Tag>
                    </td>
                    <td className="px-4 py-3 text-sm text-sda-text-secondary">
                      {item.metadata.country && (
                        <span>{item.metadata.country}</span>
                      )}
                      {item.metadata.code && (
                        <span className="ml-2">({item.metadata.code})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Icon icon="chevron-right" className="text-sda-text-muted" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-sda-text-secondary">
          Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total}
        </div>
        <div className="flex gap-2">
          <Button
            icon="chevron-left"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          />
          <Button
            icon="chevron-right"
            disabled={page * pageSize >= total}
            onClick={() => setPage(page + 1)}
          />
        </div>
      </div>
    </div>
  );
}

