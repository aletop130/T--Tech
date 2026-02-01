'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, Elevation, Icon, Button, Spinner } from '@blueprintjs/core';
import * as d3 from 'd3';

interface GraphNode {
  id: string;
  label: string;
  type: string;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Demo data - in production, fetch from API
    const nodes: GraphNode[] = [
      { id: 'sat-1', label: 'ISS', type: 'satellite' },
      { id: 'sat-2', label: 'STARLINK-1234', type: 'satellite' },
      { id: 'sat-3', label: 'COSMOS-2251', type: 'debris' },
      { id: 'gs-1', label: 'White Sands', type: 'ground_station' },
      { id: 'gs-2', label: 'Svalbard', type: 'ground_station' },
      { id: 'sensor-1', label: 'Radar 1', type: 'sensor' },
      { id: 'sensor-2', label: 'Optical 1', type: 'sensor' },
      { id: 'conj-1', label: 'Conjunction Event', type: 'conjunction' },
    ];

    const links: GraphLink[] = [
      { source: 'gs-1', target: 'sensor-1', type: 'HAS_SENSOR' },
      { source: 'gs-2', target: 'sensor-2', type: 'HAS_SENSOR' },
      { source: 'sensor-1', target: 'sat-1', type: 'TRACKS' },
      { source: 'sensor-1', target: 'sat-2', type: 'TRACKS' },
      { source: 'sensor-2', target: 'sat-1', type: 'TRACKS' },
      { source: 'sat-1', target: 'conj-1', type: 'INVOLVED_IN' },
      { source: 'sat-3', target: 'conj-1', type: 'INVOLVED_IN' },
    ];

    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

    const colorScale: Record<string, string> = {
      satellite: '#39c5cf',
      debris: '#f85149',
      ground_station: '#3fb950',
      sensor: '#d29922',
      conjunction: '#a371f7',
    };

    const simulation = d3
      .forceSimulation(nodes as any)
      .force(
        'link',
        d3.forceLink(links).id((d: any) => d.id).distance(150)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // Links
    const link = svg
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#30363d')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6);

    // Link labels
    const linkLabel = svg
      .append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .text((d) => d.type)
      .attr('font-size', 10)
      .attr('fill', '#6e7681')
      .attr('text-anchor', 'middle');

    // Nodes
    const node = svg
      .append('g')
      .selectAll('g')
      .data(nodes)
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
      .attr('fill', (d) => colorScale[d.type] || '#8b949e')
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

    setLoading(false);

    return () => {
      simulation.stop();
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="graph" className="text-sda-accent-purple" />
          Graph View
        </h1>
        <div className="flex gap-2">
          <Button icon="zoom-in" minimal />
          <Button icon="zoom-out" minimal />
          <Button icon="zoom-to-fit" minimal />
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {[
          { type: 'satellite', color: '#39c5cf', label: 'Satellite' },
          { type: 'debris', color: '#f85149', label: 'Debris' },
          { type: 'ground_station', color: '#3fb950', label: 'Ground Station' },
          { type: 'sensor', color: '#d29922', label: 'Sensor' },
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

      {/* Graph */}
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

