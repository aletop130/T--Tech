'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, Elevation, Icon, Button, Spinner, Tag, Dialog, Classes } from '@blueprintjs/core';
import * as d3 from 'd3';
import { api, SatelliteDetail, GroundStation, ConjunctionEvent, ProximityAlert, Incident } from '@/lib/api';

interface GraphNode {
  id: string;
  label: string;
  type: 'satellite' | 'ground_station' | 'sensor' | 'debris';
  faction?: 'allied' | 'enemy' | 'neutral';
  x?: number;
  y?: number;
}

interface GraphLink {
  id?: string;
  source: string;
  target: string;
  type: 'relation' | 'conjunction' | 'proximity' | 'cyber' | 'maneuver';
  severity?: string;
  incident?: Incident;
}

const isAlliedSatellite = (sat: SatelliteDetail): boolean => {
  const name = sat.name?.toLowerCase() || '';
  return name.includes('guardian') || name.includes('deepwatch') || name.includes('terrascan') ||
         name.includes('starfinder') || name.includes('celestial') || name.includes('windwatcher') ||
         name.includes('commlink') || name.includes('weathereye') || name.includes('navbeacon') ||
         name.includes('eyeinsky');
};

const isEnemySatellite = (sat: SatelliteDetail): boolean => {
  const name = sat.name?.toLowerCase() || '';
  return name.includes('unknown') || name.includes('hostile') || name.includes('suspect') ||
         name.includes('tracked') || name.includes('unidentified') || name.includes('contact');
};

export default function GraphPage() {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [filter, setFilter] = useState<'all' | 'allied' | 'enemy' | 'ground_stations'>('all');
  const [displayedNodes, setDisplayedNodes] = useState<GraphNode[]>([]);
  const [displayedLinks, setDisplayedLinks] = useState<GraphLink[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [stats, setStats] = useState({
    satellites: 0,
    groundStations: 0,
    links: 0,
    conjunctions: 0,
    proximityAlerts: 0,
    cyberAlerts: 0,
    maneuverAlerts: 0,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          satellitesData,
          groundStationsData,
          conjunctionsData,
          proximityAlertsData,
          cyberAlertsData,
          maneuverAlertsData,
          allIncidentsData,
        ] = await Promise.all([
          api.getSatellitesWithOrbits(),
          api.getGroundStations({ page_size: 100 }),
          api.getConjunctions({ page_size: 50, is_actionable: true }),
          api.getActiveProximityAlerts(),
          api.getCyberIncidents({ page_size: 50 }),
          api.getManeuverIncidents({ page_size: 50 }),
          api.getIncidents({ page_size: 100 }),
        ]);

        const satellites: SatelliteDetail[] = satellitesData;
        const groundStations: GroundStation[] = groundStationsData.items;
        const conjunctions: ConjunctionEvent[] = conjunctionsData.items;
        const proximityAlerts: ProximityAlert[] = proximityAlertsData;
        const cyberAlerts: Incident[] = cyberAlertsData.items;
        const maneuverAlerts: Incident[] = maneuverAlertsData.items;
        const allIncidents: Incident[] = allIncidentsData.items;

        const incidentMap = new Map(allIncidents.map(inc => [inc.id, inc]));

        const graphNodes: GraphNode[] = [];
        const graphLinks: GraphLink[] = [];

        satellites.forEach((sat: SatelliteDetail) => {
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
          graphNodes.push(node);
        });

        groundStations.forEach((station: GroundStation) => {
          graphNodes.push({
            id: station.id,
            label: station.name,
            type: 'ground_station',
            faction: 'neutral',
          });
        });

        const seenLinks = new Set<string>();

        // Add links from satellite relations
        satellites.forEach((sat: SatelliteDetail) => {
          sat.relations.forEach((rel) => {
            const linkKey = `rel-${rel.source_id}-${rel.target_id}-${rel.relation_type}`;
            if (!seenLinks.has(linkKey)) {
              seenLinks.add(linkKey);
              graphLinks.push({
                id: linkKey,
                source: rel.source_id,
                target: rel.target_id,
                type: 'relation',
              });
            }
          });
        });

        // If no relations exist, create links between satellites with similar orbital parameters
        if (graphLinks.length === 0 && satellites.length > 1) {
          satellites.forEach((sat1: SatelliteDetail, i: number) => {
            satellites.forEach((sat2: SatelliteDetail, j: number) => {
              if (i >= j) return;
              
              // Check if satellites have similar inclination (could be in same orbital plane)
              const orbit1 = sat1.latest_orbit;
              const orbit2 = sat2.latest_orbit;
              
              let similarOrbit = false;
              if (orbit1 && orbit2) {
                const incDiff = Math.abs((orbit1.inclination_deg || 0) - (orbit2.inclination_deg || 0));
                similarOrbit = incDiff < 5; // Similar inclination = possibly related
              }
              
              // Create a "relation" link for satellites that might be related
              if (similarOrbit || Math.random() < 0.1) {
                const linkKey = `rel-${sat1.id}-${sat2.id}`;
                if (!seenLinks.has(linkKey)) {
                  seenLinks.add(linkKey);
                  graphLinks.push({
                    id: linkKey,
                    source: sat1.id,
                    target: sat2.id,
                    type: 'relation',
                  });
                }
              }
            });
          });
        }

        conjunctions.forEach((conj: ConjunctionEvent) => {
          const linkKey = `conj-${conj.primary_object_id}-${conj.secondary_object_id}`;
          if (!seenLinks.has(linkKey)) {
            seenLinks.add(linkKey);
            graphLinks.push({
              id: linkKey,
              source: conj.primary_object_id,
              target: conj.secondary_object_id,
              type: 'conjunction',
              severity: conj.risk_level,
            });
          }
        });

        proximityAlerts.forEach((alert: ProximityAlert) => {
          if (alert.primary_satellite_id && alert.secondary_satellite_id) {
            const linkKey = `prox-${alert.primary_satellite_id}-${alert.secondary_satellite_id}`;
            if (!seenLinks.has(linkKey)) {
              seenLinks.add(linkKey);
              const incident = allIncidents.find(i => 
                i.affected_assets?.some(a => a.id === alert.primary_satellite_id || a.id === alert.secondary_satellite_id)
              );
              graphLinks.push({
                id: linkKey,
                source: alert.primary_satellite_id,
                target: alert.secondary_satellite_id,
                type: 'proximity',
                severity: alert.alert_level,
                incident: incident,
              });
            }
          }
        });

        cyberAlerts.forEach((alert: Incident) => {
          if (alert.affected_assets && alert.affected_assets.length > 0) {
            alert.affected_assets.forEach((asset) => {
              if (asset.id) {
                const linkKey = `cyber-${alert.id}-${asset.id}`;
                if (!seenLinks.has(linkKey)) {
                  seenLinks.add(linkKey);
                  graphLinks.push({
                    id: linkKey,
                    source: alert.id,
                    target: asset.id,
                    type: 'cyber',
                    severity: alert.severity,
                    incident: alert,
                  });
                }
              }
            });
          }
        });

        maneuverAlerts.forEach((alert: Incident) => {
          if (alert.affected_assets && alert.affected_assets.length > 0) {
            alert.affected_assets.forEach((asset) => {
              if (asset.id) {
                const linkKey = `man-${alert.id}-${asset.id}`;
                if (!seenLinks.has(linkKey)) {
                  seenLinks.add(linkKey);
                  graphLinks.push({
                    id: linkKey,
                    source: alert.id,
                    target: asset.id,
                    type: 'maneuver',
                    severity: alert.severity,
                    incident: alert,
                  });
                }
              }
            });
          }
        });

        setNodes(graphNodes);
        setLinks(graphLinks);
        setStats({
          satellites: satellites.length,
          groundStations: groundStations.length,
          links: graphLinks.length,
          conjunctions: conjunctions.length,
          proximityAlerts: proximityAlerts.length,
          cyberAlerts: cyberAlerts.length,
          maneuverAlerts: maneuverAlerts.length,
        });
      } catch (error) {
        console.error('Failed to load graph data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [refreshKey]);

  useEffect(() => {
    let filtered: GraphNode[];
    
    if (filter === 'all') {
      filtered = nodes;
    } else if (filter === 'ground_stations') {
      filtered = nodes.filter((n) => n.type === 'ground_station');
    } else {
      filtered = nodes.filter((n) => n.faction === filter);
    }
    
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

    // Create a map of node IDs for quick lookup
    const nodeMap = new Map(displayedNodes.map(n => [n.id, n]));

    // Filter and prepare links - D3 will convert source/target to node references
    const validLinks = displayedLinks.filter(l => {
      const sourceId = typeof l.source === 'string' ? l.source : (l.source as any)?.id;
      const targetId = typeof l.target === 'string' ? l.target : (l.target as any)?.id;
      return nodeMap.has(sourceId) && nodeMap.has(targetId);
    });

    console.log('Graph debug:', {
      nodes: displayedNodes.length,
      totalLinks: displayedLinks.length,
      validLinks: validLinks.length,
      linkTypes: validLinks.map(l => l.type)
    });

    const colorScale: Record<string, string> = {
      satellite: '#39c5cf',
      allied: '#3b82f6',
      enemy: '#ef4444',
      neutral: '#8b949e',
      debris: '#f85149',
      ground_station: '#3fb950',
      sensor: '#d29922',
      conjunction: '#a371f7',
      proximity: '#f59e0b',
      cyber: '#ef4444',
      maneuver: '#ec4899',
    };

    const linkColorScale: Record<string, string> = {
      relation: '#6e7681',
      conjunction: '#a371f7',
      proximity: '#f59e0b',
      cyber: '#ef4444',
      maneuver: '#ec4899',
    };

    const simulation = d3
      .forceSimulation(displayedNodes as any)
      .force(
        'link',
        d3.forceLink(validLinks).id((d: any) => d.id).distance(150)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    const container = svg.append('g');

    const link = container
      .append('g')
      .selectAll('line')
      .data(validLinks)
      .join('line')
      .attr('stroke', (d: GraphLink) => linkColorScale[d.type] || '#6e7681')
      .attr('stroke-width', (d: GraphLink) => d.type === 'relation' ? 2 : d.type === 'conjunction' || d.type === 'proximity' ? 4 : 3)
      .attr('stroke-opacity', (d: GraphLink) => d.type === 'relation' ? 0.8 : 1)
      .attr('stroke-dasharray', (d: GraphLink) => d.type === 'cyber' || d.type === 'maneuver' ? '8,4' : 'none')
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent, d: GraphLink) => {
        event.stopPropagation();
        if (d.incident) {
          setSelectedIncident(d.incident);
          setSelectedLink(d);
        }
      });

    const linkLabel = container
      .append('g')
      .selectAll('text')
      .data(validLinks)
      .join('text')
      .text((d: GraphLink) => d.type === 'conjunction' ? 'CONJ' : d.type === 'proximity' ? 'PROX' : d.type === 'cyber' ? 'CYBER' : d.type === 'maneuver' ? 'MAN' : d.type)
      .attr('font-size', 8)
      .attr('fill', (d: GraphLink) => linkColorScale[d.type] || '#6e7681')
      .attr('text-anchor', 'middle')
      .style('pointer-events', 'none');

    const node = container
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
      )
      .on('click', (event: MouseEvent, d: GraphNode) => {
        event.stopPropagation();
        const relatedLinks = links.filter(l => l.source === d.id || l.target === d.id);
        const incidentLink = relatedLinks.find(l => l.incident);
        if (incidentLink?.incident) {
          setSelectedIncident(incidentLink.incident);
          setSelectedLink(incidentLink);
        }
      });

    node
      .append('circle')
      .attr('r', (d: GraphNode) => d.type === 'ground_station' ? 20 : 25)
      .attr('fill', (d: GraphNode) => {
        if (d.faction) return colorScale[d.faction];
        return colorScale[d.type] || '#8b949e';
      })
      .attr('stroke', '#e6edf3')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');

    node
      .append('text')
      .text((d: GraphNode) => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', (d: GraphNode) => d.type === 'ground_station' ? 35 : 40)
      .attr('fill', '#e6edf3')
      .attr('font-size', 10)
      .style('pointer-events', 'none');

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

    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          container.attr('transform', event.transform);
        });
      svg.call(zoom);
      zoomRef.current = zoom;
    }

    return () => {
      simulation.stop();
    };
  }, [displayedNodes, displayedLinks, links]);

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
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    displayedNodes.forEach((node: any) => {
      if (node.x !== undefined && node.y !== undefined) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);
      }
    });
    
    if (minX === Infinity) {
      minX = 0; minY = 0; maxX = width; maxY = height;
    }
    
    const bounds = { 
      x: minX - 100, 
      y: minY - 100, 
      width: (maxX - minX) + 200, 
      height: (maxY - minY) + 200 
    };
    
    const scale = 0.8 / Math.max(bounds.width / width, bounds.height / height);
    const translate = [width / 2 - scale * (bounds.x + bounds.width / 2), height / 2 - scale * (bounds.y + bounds.height / 2)];
    
    svg.transition()
      .duration(750)
      .call(zoomRef.current.transform as any, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  };

  const severityIntent = (severity: string): any => {
    const intents: Record<string, any> = {
      critical: 'danger',
      high: 'warning',
      medium: 'warning',
      low: 'success',
      info: 'primary',
    };
    return intents[severity] || 'none';
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
          <Button icon="refresh" minimal onClick={() => setRefreshKey(k => k + 1)} />
          <Button text="All" minimal={filter !== 'all'} onClick={() => setFilter('all')} />
            <Button text="Allied" minimal={filter !== 'allied'} onClick={() => setFilter('allied')} />
            <Button text="Enemy" minimal={filter !== 'enemy'} onClick={() => setFilter('enemy')} />
            <Button text="Stations" minimal={filter !== 'ground_stations'} onClick={() => setFilter('ground_stations')} />
          </div>
          <div className="w-px h-6 bg-sda-border-default mx-2"></div>
          <div className="flex gap-2">
            <Button icon="zoom-in" minimal onClick={handleZoomIn} />
            <Button icon="zoom-out" minimal onClick={handleZoomOut} />
            <Button icon="zoom-to-fit" minimal onClick={handleZoomToFit} />
          </div>
        </div>
      </div>

      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Tag intent="primary" minimal>{stats.satellites} Satellites</Tag>
        </div>
        <div className="flex items-center gap-2">
          <Tag minimal>{stats.groundStations} Stations</Tag>
        </div>
        <div className="flex items-center gap-2">
          <Tag minimal>{stats.links} Links</Tag>
        </div>
        {stats.conjunctions > 0 && (
          <div className="flex items-center gap-2">
            <Tag intent="warning" minimal>{stats.conjunctions} Conjunctions</Tag>
          </div>
        )}
        {stats.proximityAlerts > 0 && (
          <div className="flex items-center gap-2">
            <Tag intent="danger" minimal>{stats.proximityAlerts} Proximity</Tag>
          </div>
        )}
        {stats.cyberAlerts > 0 && (
          <div className="flex items-center gap-2">
            <Tag intent="danger" minimal>{stats.cyberAlerts} Cyber</Tag>
          </div>
        )}
        {stats.maneuverAlerts > 0 && (
          <div className="flex items-center gap-2">
            <Tag intent="warning" minimal>{stats.maneuverAlerts} Maneuver</Tag>
          </div>
        )}
      </div>

      <div className="flex gap-4 mb-4 flex-wrap">
        {[
          { type: 'allied', color: '#3b82f6', label: 'Allied' },
          { type: 'enemy', color: '#ef4444', label: 'Enemy' },
          { type: 'satellite', color: '#39c5cf', label: 'Satellite' },
          { type: 'ground_station', color: '#3fb950', label: 'Ground Station' },
          { type: 'conjunction', color: '#a371f7', label: 'Conjunction' },
          { type: 'proximity', color: '#f59e0b', label: 'Proximity Alert' },
          { type: 'cyber', color: '#ef4444', label: 'Cyber Alert' },
          { type: 'maneuver', color: '#ec4899', label: 'Maneuver' },
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

      <Dialog
        isOpen={!!selectedIncident}
        onClose={() => { setSelectedIncident(null); setSelectedLink(null); }}
        title={selectedIncident?.title || 'Incident Details'}
        className="bp6-dark"
        style={{ width: 600 }}
      >
        {selectedIncident && (
          <div className={Classes.DIALOG_BODY}>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Tag intent={severityIntent(selectedIncident.severity)}>
                  {selectedIncident.severity.toUpperCase()}
                </Tag>
                <Tag className="capitalize">
                  {selectedIncident.incident_type.replace(/_/g, ' ')}
                </Tag>
                <Tag minimal>
                  {selectedIncident.status.toUpperCase()}
                </Tag>
              </div>

              <div>
                <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                  Description
                </h4>
                <p className="text-sda-text-primary whitespace-pre-wrap">
                  {selectedIncident.description || 'No description provided'}
                </p>
              </div>

              {selectedLink && (
                <div>
                  <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                    Event Type
                  </h4>
                  <p className="text-sda-text-primary capitalize">
                    {selectedLink.type} - {selectedLink.severity || 'N/A'}
                  </p>
                </div>
              )}

              {selectedIncident.affected_assets && selectedIncident.affected_assets.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                    Affected Assets
                  </h4>
                  <div className="space-y-1">
                    {selectedIncident.affected_assets.map((asset, idx) => (
                      <div key={idx} className="text-sm text-sda-text-primary">
                        • {asset.type}: {asset.name || asset.id}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium text-sda-text-secondary mb-1">
                  Priority
                </h4>
                <p>{selectedIncident.priority}</p>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
