'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, Elevation, Icon, Button, Spinner } from '@blueprintjs/core';
import * as d3 from 'd3';
import { api, SatelliteDetail } from '@/lib/api';
import { isAlliedSatellite, isEnemySatellite } from '@/lib/satelliteFaction';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  faction?: 'allied' | 'enemy' | 'neutral';
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

export default function GraphPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [filter, setFilter] = useState<'all' | 'allied' | 'enemy'>('all');
  const [displayedNodes, setDisplayedNodes] = useState<GraphNode[]>([]);
  const [displayedLinks, setDisplayedLinks] = useState<GraphLink[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const satellites = await api.getSatellitesWithOrbits();
        
        const graphNodes: GraphNode[] = satellites.map((sat: SatelliteDetail) => {
          const node: GraphNode = {
            id: sat.id,
            label: sat.name,
            type: 'satellite',
          };
          if (isAlliedSatellite(sat)) {
            node.faction = 'allied';
          } else if (isEnemySatellite(sat)) {
            node.faction = 'enemy';
          } else {
            node.faction = 'neutral';
          }
          return node;
        });

        const graphLinks: GraphLink[] = [];
        const seenLinks = new Set<string>();

        satellites.forEach((sat: SatelliteDetail) => {
          sat.relations.forEach((rel) => {
            const linkKey = `${rel.source_id}-${rel.target_id}-${rel.relation_type}`;
            if (!seenLinks.has(linkKey)) {
              seenLinks.add(linkKey);
              graphLinks.push({
                source: rel.source_id,
                target: rel.target_id,
                type: rel.relation_type,
              });
            }
          });
        });

        setNodes(graphNodes);
        setLinks(graphLinks);
      } catch (error) {
        console.error('Failed to load graph data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const filtered =
      filter === 'all'
        ? nodes
        : nodes.filter((n) => n.faction === filter);
    setDisplayedNodes(filtered);

    const nodeIds = new Set(filtered.map((n) => n.id));
    const filteredLinks = links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));
    setDisplayedLinks(filteredLinks);
  }, [filter, nodes, links]);

  useEffect(() => {
    if (!svgRef.current || displayedNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

    const colorScale: Record<string, string> = {
      satellite: '#39c5cf',
      allied:    '#3b82f6',
      enemy:     '#ef4444',
      debris:    '#f85149',
      ground_station: '#3fb950',
      sensor:    '#d29922',
      conjunction: '#a371f7',
    };

    const simulation = d3
      .forceSimulation(displayedNodes as any)
      .force(
        'link',
        d3.forceLink(displayedLinks).id((d: any) => d.id).distance(150)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    const link = svg
      .append('g')
      .selectAll('line')
      .data(displayedLinks)
      .join('line')
      .attr('stroke', '#30363d')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6);

    const linkLabel = svg
      .append('g')
      .selectAll('text')
      .data(displayedLinks)
      .join('text')
      .text((d) => d.type)
      .attr('font-size', 10)
      .attr('fill', '#6e7681')
      .attr('text-anchor', 'middle');

    const node = svg
      .append('g')
      .selectAll('g')
      .data(displayedNodes)
      .join('g')
      .call(
        d3
          .drag<any, GraphNode>()
          .on('start', (event, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d: any) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d: any) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .append('circle')
      .attr('r', 25)
      .attr('fill', (d: GraphNode) => {
        if (d.faction) return colorScale[d.faction];
        return colorScale[d.type] || '#8b949e';
      })
      .attr('stroke', '#e6edf3')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');

    node
      .append('text')
      .text((d) => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', 40)
      .attr('fill', '#e6edf3')
      .attr('font-size', 12);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

    node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Setup zoom behavior
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          svg.select('g').attr('transform', event.transform);
        });
      svg.call(zoom);
      zoomRef.current = zoom;
    }

    return () => {
      simulation.stop();
    };
  }, [displayedNodes, displayedLinks]);

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(300).call(zoomRef.current.scaleBy as any, 1.3);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(300).call(zoomRef.current.scaleBy as any, 0.7);
  };

  const handleZoomToFit = () => {
    if (!svgRef.current || !zoomRef.current || displayedNodes.length === 0) return;
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    
    // Get bounding box of all nodes
    const bounds = { x: 0, y: 0, width: 800, height: 600 }; // Default fallback
    
    const scale = 0.8 / Math.max(bounds.width / width, bounds.height / height);
    const translate = [width / 2 - scale * (bounds.x + bounds.width / 2), height / 2 - scale * (bounds.y + bounds.height / 2)];
    
    svg.transition()
      .duration(750)
      .call(zoomRef.current.transform as any, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="graph" className="text-sda-accent-purple" />
          Graph View
        </h1>
        <div className="flex gap-2 items-center">
          <div className="flex gap-2">
            <Button text="All" minimal={filter !== 'all'} onClick={() => setFilter('all')} />
            <Button text="Allied" minimal={filter !== 'allied'} onClick={() => setFilter('allied')} />
            <Button text="Enemy" minimal={filter !== 'enemy'} onClick={() => setFilter('enemy')} />
          </div>
          <div className="w-px h-6 bg-sda-border-default mx-2"></div>
          <div className="flex gap-2">
            <Button icon="zoom-in" minimal onClick={handleZoomIn} />
            <Button icon="zoom-out" minimal onClick={handleZoomOut} />
            <Button icon="zoom-to-fit" minimal onClick={handleZoomToFit} />
          </div>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        {[
          { type: 'allied',   color: '#3b82f6', label: 'Allied' },
          { type: 'enemy',    color: '#ef4444', label: 'Enemy' },
          { type: 'satellite', color: '#39c5cf', label: 'Satellite' },
          { type: 'debris',   color: '#f85149', label: 'Debris' },
          { type: 'ground_station', color: '#3fb950', label: 'Ground Station' },
          { type: 'sensor',   color: '#d29922', label: 'Sensor' },
          { type: 'conjunction', color: '#a371f7', label: 'Conjunction' },
        ].map((item) => (
          <div key={item.type} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm text-sda-text-secondary">{item.label}</span>
          </div>
        ))}
      </div>

      <Card elevation={Elevation.TWO} className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        )}
        <svg ref={svgRef} className="w-full h-full" />
      </Card>
    </div>
  );
}
