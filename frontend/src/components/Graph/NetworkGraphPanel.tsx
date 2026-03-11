"use client";

import { useEffect, useRef, useState } from "react";
import { severityIntent } from "@/lib/severity";
import {
  Button,
  Callout,
  Card,
  Elevation,
  Icon,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import * as d3 from "d3";
import { api, type ConjunctionEvent, type SatelliteDetail } from "@/lib/api";
import type {
  OrbitalSimilarityThreat,
  ProximityThreat,
  SignalThreat,
} from "@/types/threats";

type NodeFaction = "allied" | "enemy" | "neutral" | "unknown";
type EdgeKind = "proximity" | "orbital" | "signal" | "conjunction";
type GraphFilter = "all" | EdgeKind;

interface DetailRow {
  label: string;
  value: string;
}

interface NetworkNode {
  id: string;
  label: string;
  type: "satellite";
  faction: NodeFaction;
  riskScore: number;
  directConnections: number;
  issueCounts: Record<EdgeKind, number>;
  riskComponents: Record<string, number>;
  country?: string;
  operator?: string;
  orbitType?: string;
  tags: string[];
}

interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  severity: string;
  score: number;
  label: string;
  summary: string;
  details: DetailRow[];
}

type RenderNode = NetworkNode & d3.SimulationNodeDatum;
type RenderLink = NetworkEdge & d3.SimulationLinkDatum<RenderNode>;

const EDGE_LABELS: Record<EdgeKind, string> = {
  proximity: "PROX",
  orbital: "OSIM",
  signal: "SIG",
  conjunction: "CDM",
};

const EDGE_COLORS: Record<EdgeKind, string> = {
  proximity: "#fb923c",
  orbital: "#8b5cf6",
  signal: "#14b8a6",
  conjunction: "#f43f5e",
};

const NODE_COLORS: Record<NodeFaction, string> = {
  allied: "#3b82f6",
  enemy: "#ef4444",
  neutral: "#94a3b8",
  unknown: "#64748b",
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3.5,
  threatened: 3,
  watched: 2,
  medium: 2,
  low: 1,
  nominal: 0.5,
  info: 0.5,
};

function normalizeFaction(value?: string | null): NodeFaction {
  if (!value) return "unknown";
  const normalized = value.toLowerCase();
  if (normalized === "allied" || normalized === "friendly") return "allied";
  if (normalized === "enemy" || normalized === "hostile" || normalized === "adversary") return "enemy";
  if (normalized === "neutral") return "neutral";
  return "unknown";
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function edgePriority(edge: NetworkEdge): number {
  return (SEVERITY_RANK[edge.severity.toLowerCase()] ?? 0) + edge.score;
}

function edgeStrokeWidth(edge: NetworkEdge): number {
  return 2 + Math.min(4, edgePriority(edge));
}

function nodeRadius(node: NetworkNode): number {
  return 15 + Math.min(8, node.riskScore * 10) + (node.faction === "enemy" ? 2 : 0);
}

function buildConjunctionScore(conjunction: ConjunctionEvent): number {
  if (typeof conjunction.risk_score === "number") {
    return Math.max(0, Math.min(1, conjunction.risk_score / 100));
  }
  if (typeof conjunction.collision_probability === "number") {
    return Math.max(0, Math.min(1, conjunction.collision_probability));
  }
  return 0.35;
}

export function NetworkGraphPanel() {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [edgeFilter, setEdgeFilter] = useState<GraphFilter>("all");
  const [focusSatelliteId, setFocusSatelliteId] = useState<string>("all");
  const [allNodes, setAllNodes] = useState<NetworkNode[]>([]);
  const [allEdges, setAllEdges] = useState<NetworkEdge[]>([]);
  const [displayedNodes, setDisplayedNodes] = useState<NetworkNode[]>([]);
  const [displayedEdges, setDisplayedEdges] = useState<NetworkEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRefreshKey((current) => current + 1);
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const [
          satelliteCatalog,
          fleetRisk,
          proximityThreats,
          signalThreats,
          orbitalThreats,
          conjunctionsResponse,
          adversaryCatalog,
        ] = await Promise.all([
          api.getSatellitesWithOrbits(),
          api.getFleetRiskCurrent(),
          api.getProximityThreats(),
          api.getSignalThreats(),
          api.getOrbitalSimilarityThreats(),
          api.getConjunctions({ page_size: 30, is_actionable: true }),
          api.getAdversaryCatalog(),
        ]);

        if (cancelled) return;

        const satellitesById = new Map<string, SatelliteDetail>(
          satelliteCatalog.map((satellite) => [satellite.id, satellite]),
        );
        const riskById = new Map(
          fleetRisk.satellites.map((snapshot) => [snapshot.satellite_id, snapshot]),
        );
        const adversaryById = new Map(
          adversaryCatalog.map((satellite) => [satellite.satellite_id, satellite]),
        );

        const nodes = new Map<string, NetworkNode>();
        const edges = new Map<string, NetworkEdge>();

        const ensureNode = (satelliteId: string, fallbackLabel: string, factionHint?: NodeFaction): NetworkNode => {
          const existing = nodes.get(satelliteId);
          const catalogSatellite = satellitesById.get(satelliteId);
          const adversarySatellite = adversaryById.get(satelliteId);
          const riskSnapshot = riskById.get(satelliteId);

          const computedFaction =
            normalizeFaction(catalogSatellite?.faction) !== "unknown"
              ? normalizeFaction(catalogSatellite?.faction)
              : adversarySatellite
                ? "enemy"
                : (factionHint ?? "unknown");

          if (existing) {
            if (existing.faction === "unknown" && computedFaction !== "unknown") existing.faction = computedFaction;
            if (!existing.country && (catalogSatellite?.country || adversarySatellite?.country)) existing.country = catalogSatellite?.country || adversarySatellite?.country;
            if (!existing.operator && (catalogSatellite?.operator || adversarySatellite?.operator)) existing.operator = catalogSatellite?.operator || adversarySatellite?.operator;
            if (!existing.orbitType && catalogSatellite?.latest_orbit?.orbit_type) existing.orbitType = catalogSatellite.latest_orbit.orbit_type;
            if (!existing.label || existing.label === existing.id) existing.label = catalogSatellite?.name || adversarySatellite?.name || fallbackLabel || existing.id;
            return existing;
          }

          const newNode: NetworkNode = {
            id: satelliteId,
            label: catalogSatellite?.name || adversarySatellite?.name || fallbackLabel || satelliteId,
            type: "satellite",
            faction: computedFaction,
            riskScore: riskSnapshot?.risk_score ?? 0,
            directConnections: 0,
            issueCounts: { proximity: 0, orbital: 0, signal: 0, conjunction: 0 },
            riskComponents: riskSnapshot?.components ?? {},
            country: catalogSatellite?.country || adversarySatellite?.country,
            operator: catalogSatellite?.operator || adversarySatellite?.operator,
            orbitType: catalogSatellite?.latest_orbit?.orbit_type,
            tags: catalogSatellite?.tags ?? adversarySatellite?.tags ?? [],
          };

          nodes.set(satelliteId, newNode);
          return newNode;
        };

        const addEdge = (edge: NetworkEdge) => {
          const existing = edges.get(edge.id);
          if (!existing || edgePriority(edge) > edgePriority(existing)) {
            edges.set(edge.id, edge);
          }
        };

        proximityThreats.forEach((threat: ProximityThreat) => {
          const source = ensureNode(threat.foreignSatId, threat.foreignSatName, "enemy");
          const target = ensureNode(threat.targetAssetId, threat.targetAssetName, "allied");
          addEdge({
            id: `proximity:${source.id}:${target.id}`,
            source: source.id, target: target.id,
            kind: "proximity", severity: threat.severity, score: threat.confidence,
            label: EDGE_LABELS.proximity,
            summary: `${threat.missDistanceKm.toFixed(1)} km miss distance, TCA in ${threat.tcaInMinutes} min`,
            details: [
              { label: "Foreign Satellite", value: source.label },
              { label: "Target Satellite", value: target.label },
              { label: "Miss Distance", value: `${threat.missDistanceKm.toFixed(1)} km` },
              { label: "Approach Velocity", value: `${threat.approachVelocityKms.toFixed(2)} km/s` },
              { label: "TCA", value: `${threat.tcaInMinutes} min` },
              { label: "Pattern", value: threat.approachPattern },
              { label: "Confidence", value: formatPercent(threat.confidence) },
            ],
          });
        });

        orbitalThreats.forEach((threat: OrbitalSimilarityThreat) => {
          const source = ensureNode(threat.foreignSatId, threat.foreignSatName, "enemy");
          const target = ensureNode(threat.targetAssetId, threat.targetAssetName, "allied");
          addEdge({
            id: `orbital:${source.id}:${target.id}`,
            source: source.id, target: target.id,
            kind: "orbital", severity: threat.severity, score: threat.confidence,
            label: EDGE_LABELS.orbital,
            summary: `${threat.pattern} pattern, ${threat.altitudeDiffKm.toFixed(1)} km altitude delta`,
            details: [
              { label: "Foreign Satellite", value: source.label },
              { label: "Target Satellite", value: target.label },
              { label: "Pattern", value: threat.pattern },
              { label: "Altitude Delta", value: `${threat.altitudeDiffKm.toFixed(1)} km` },
              { label: "Inclination Delta", value: `${threat.inclinationDiffDeg.toFixed(2)} deg` },
              { label: "Divergence Score", value: threat.divergenceScore.toFixed(4) },
              { label: "Confidence", value: formatPercent(threat.confidence) },
            ],
          });
        });

        signalThreats.forEach((threat: SignalThreat) => {
          const source = ensureNode(threat.interceptorId, threat.interceptorName, "enemy");
          const target = ensureNode(threat.targetLinkAssetId, threat.targetLinkAssetName, "allied");
          addEdge({
            id: `signal:${source.id}:${target.id}`,
            source: source.id, target: target.id,
            kind: "signal", severity: threat.severity, score: threat.interceptionProbability,
            label: EDGE_LABELS.signal,
            summary: `${formatPercent(threat.interceptionProbability)} interception risk via ${threat.groundStationName}`,
            details: [
              { label: "Interceptor", value: source.label },
              { label: "Target Satellite", value: target.label },
              { label: "Ground Station", value: threat.groundStationName },
              { label: "Interception Probability", value: formatPercent(threat.interceptionProbability) },
              { label: "Comm Windows At Risk", value: `${threat.commWindowsAtRisk}/${threat.totalCommWindows}` },
              { label: "Path Angle", value: `${threat.signalPathAngleDeg.toFixed(1)} deg` },
              { label: "Confidence", value: formatPercent(threat.confidence) },
            ],
          });
        });

        conjunctionsResponse.items.forEach((conjunction: ConjunctionEvent) => {
          const source = ensureNode(conjunction.primary_object_id, conjunction.object1_name || conjunction.primary_object_id);
          const target = ensureNode(conjunction.secondary_object_id, conjunction.object2_name || conjunction.secondary_object_id);
          const left = [source.id, target.id].sort()[0];
          const right = [source.id, target.id].sort()[1];
          addEdge({
            id: `conjunction:${left}:${right}`,
            source: source.id, target: target.id,
            kind: "conjunction", severity: conjunction.risk_level, score: buildConjunctionScore(conjunction),
            label: EDGE_LABELS.conjunction,
            summary: `${conjunction.miss_distance_km.toFixed(2)} km miss distance at ${new Date(conjunction.tca).toLocaleString()}`,
            details: [
              { label: "Primary Object", value: source.label },
              { label: "Secondary Object", value: target.label },
              { label: "Risk Level", value: conjunction.risk_level.toUpperCase() },
              { label: "Miss Distance", value: `${conjunction.miss_distance_km.toFixed(2)} km` },
              { label: "TCA", value: new Date(conjunction.tca).toLocaleString() },
              { label: "Collision Probability", value: typeof conjunction.collision_probability === "number" ? formatPercent(conjunction.collision_probability) : "N/A" },
            ],
          });
        });

        const nodeList = Array.from(nodes.values());
        const edgeList = Array.from(edges.values()).sort((l, r) => edgePriority(r) - edgePriority(l));

        edgeList.forEach((edge) => {
          const source = nodes.get(edge.source);
          const target = nodes.get(edge.target);
          if (source) { source.directConnections += 1; source.issueCounts[edge.kind] += 1; }
          if (target) { target.directConnections += 1; target.issueCounts[edge.kind] += 1; }
        });

        const fleetTimestamp =
          typeof fleetRisk.computed_at === "number"
            ? new Date(fleetRisk.computed_at * 1000).toISOString()
            : new Date().toISOString();

        setAllNodes(nodeList.sort((l, r) => r.riskScore - l.riskScore || r.directConnections - l.directConnections || l.label.localeCompare(r.label)));
        setAllEdges(edgeList);
        setLastUpdated(fleetTimestamp);
      } catch (error) {
        console.warn("Failed to load live graph data:", error);
        if (!cancelled) { setAllNodes([]); setAllEdges([]); setLastUpdated(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    const filteredEdges = allEdges.filter((edge) => edgeFilter === "all" || edge.kind === edgeFilter);

    if (focusSatelliteId !== "all") {
      const neighborhoodIds = new Set<string>([focusSatelliteId]);
      filteredEdges.forEach((edge) => {
        if (edge.source === focusSatelliteId || edge.target === focusSatelliteId) {
          neighborhoodIds.add(edge.source);
          neighborhoodIds.add(edge.target);
        }
      });
      const scopedEdges = filteredEdges.filter((edge) =>
        neighborhoodIds.has(edge.source) && neighborhoodIds.has(edge.target) &&
        (edge.source === focusSatelliteId || edge.target === focusSatelliteId)
      );
      setDisplayedEdges(scopedEdges);
      setDisplayedNodes(allNodes.filter((node) => neighborhoodIds.has(node.id)));
      return;
    }

    const topEdges = filteredEdges.slice(0, 18);
    const visibleNodeIds = new Set<string>();
    topEdges.forEach((edge) => { visibleNodeIds.add(edge.source); visibleNodeIds.add(edge.target); });
    setDisplayedEdges(topEdges);
    setDisplayedNodes(allNodes.filter((node) => visibleNodeIds.has(node.id)));
  }, [allEdges, allNodes, edgeFilter, focusSatelliteId]);

  useEffect(() => {
    if (selectedNodeId && !displayedNodes.some((node) => node.id === selectedNodeId)) setSelectedNodeId(null);
    if (selectedEdgeId && !displayedEdges.some((edge) => edge.id === selectedEdgeId)) setSelectedEdgeId(null);
  }, [displayedEdges, displayedNodes, selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svgElement = svgRef.current;
    const svg = d3.select(svgElement);
    const width = svgElement.clientWidth;
    const height = svgElement.clientHeight;

    svg.selectAll("*").remove();
    svg.on("click", () => { setSelectedNodeId(null); setSelectedEdgeId(null); });

    if (displayedNodes.length === 0 || displayedEdges.length === 0) return;

    const renderNodes: RenderNode[] = displayedNodes.map((node) => ({ ...node }));
    const nodeById = new Map(renderNodes.map((node) => [node.id, node]));
    const renderLinks: RenderLink[] = [];
    displayedEdges.forEach((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) return;
      renderLinks.push({ ...edge, source, target } as RenderLink);
    });

    const container = svg.append("g");

    const simulation = d3
      .forceSimulation<RenderNode>(renderNodes)
      .force("link", d3.forceLink<RenderNode, RenderLink>(renderLinks).id((node) => node.id).distance((link) => ({ proximity: 110, signal: 140, orbital: 160, conjunction: 180 }[link.kind] ?? 150)))
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<RenderNode>().radius((node) => nodeRadius(node) + 26));

    const linkGroup = container.append("g").selectAll("line").data(renderLinks).join("line")
      .attr("stroke", (edge) => EDGE_COLORS[edge.kind])
      .attr("stroke-width", (edge) => edgeStrokeWidth(edge))
      .attr("stroke-opacity", 0.9)
      .attr("stroke-dasharray", (edge) => edge.kind === "orbital" ? "7,4" : "none")
      .style("cursor", "pointer")
      .on("click", (event, edge) => { event.stopPropagation(); setSelectedEdgeId(edge.id); setSelectedNodeId(null); });

    linkGroup.append("title").text((edge) => `${edge.label}: ${edge.summary}`);

    const linkLabels = container.append("g").selectAll("text").data(renderLinks).join("text")
      .text((edge) => edge.label)
      .attr("font-size", 9).attr("font-weight", 700)
      .attr("fill", (edge) => EDGE_COLORS[edge.kind])
      .attr("text-anchor", "middle")
      .style("pointer-events", "none");

    const dragBehavior = d3.drag<SVGGElement, RenderNode>()
      .on("start", (event, node) => { if (!event.active) simulation.alphaTarget(0.3).restart(); node.fx = node.x; node.fy = node.y; })
      .on("drag",  (event, node) => { node.fx = event.x; node.fy = event.y; })
      .on("end",   (event, node) => { if (!event.active) simulation.alphaTarget(0); node.fx = null; node.fy = null; });

    const nodeGroup = container.append("g").selectAll<SVGGElement, RenderNode>("g").data(renderNodes).join("g")
      .style("cursor", "pointer")
      .call(dragBehavior)
      .on("click", (event, node) => { event.stopPropagation(); setSelectedNodeId(node.id); setSelectedEdgeId(null); });

    nodeGroup.append("circle").attr("r", (node) => nodeRadius(node)).attr("fill", (node) => NODE_COLORS[node.faction]).attr("stroke", (node) => node.riskScore >= 0.5 ? "#f8fafc" : "#cbd5e1").attr("stroke-width", (node) => node.riskScore >= 0.5 ? 3 : 2);
    nodeGroup.append("circle").attr("r", (node) => nodeRadius(node) + 5).attr("fill", "none").attr("stroke", "#facc15").attr("stroke-width", (node) => node.riskScore >= 0.25 ? 1.5 : 0).attr("stroke-opacity", 0.8);
    nodeGroup.append("text").text((node) => node.label).attr("text-anchor", "middle").attr("dy", (node) => nodeRadius(node) + 15).attr("fill", "#e2e8f0").attr("font-size", 10).style("pointer-events", "none");
    nodeGroup.append("text").text((node) => node.riskScore > 0 ? formatPercent(node.riskScore) : "").attr("text-anchor", "middle").attr("dy", 4).attr("fill", "#0f172a").attr("font-size", 9).attr("font-weight", 700).style("pointer-events", "none");
    nodeGroup.append("title").text((node) => `${node.label}\nFaction: ${node.faction}\nRisk: ${formatPercent(node.riskScore)}\nLinks: ${node.directConnections}`);

    const getSourceNode = (link: RenderLink): RenderNode => link.source as RenderNode;
    const getTargetNode = (link: RenderLink): RenderNode => link.target as RenderNode;

    simulation.on("tick", () => {
      linkGroup.attr("x1", (link) => getSourceNode(link).x ?? 0).attr("y1", (link) => getSourceNode(link).y ?? 0).attr("x2", (link) => getTargetNode(link).x ?? 0).attr("y2", (link) => getTargetNode(link).y ?? 0);
      linkLabels.attr("x", (link) => ((getSourceNode(link).x ?? 0) + (getTargetNode(link).x ?? 0)) / 2).attr("y", (link) => ((getSourceNode(link).y ?? 0) + (getTargetNode(link).y ?? 0)) / 2 - 6);
      nodeGroup.attr("transform", (node) => `translate(${node.x ?? 0},${node.y ?? 0})`);
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.4, 3]).on("zoom", (event) => { container.attr("transform", event.transform); });
    svg.call(zoom);
    zoomRef.current = zoom;

    return () => { simulation.stop(); };
  }, [displayedEdges, displayedNodes]);

  const selectedNode = selectedNodeId ? (displayedNodes.find((node) => node.id === selectedNodeId) ?? null) : null;
  const selectedEdge = selectedEdgeId ? (displayedEdges.find((edge) => edge.id === selectedEdgeId) ?? null) : null;

  const highRiskNodeCount = displayedNodes.filter((node) => node.riskScore >= 0.3).length;
  const topRiskNode = displayedNodes[0] ?? null;
  const focusOptions = allNodes.filter((node) => node.type === "satellite");

  const handleZoomIn = () => { if (!svgRef.current || !zoomRef.current) return; d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy as never, 1.2); };
  const handleZoomOut = () => { if (!svgRef.current || !zoomRef.current) return; d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy as never, 0.8); };

  const handleZoomToFit = () => {
    if (!svgRef.current || !zoomRef.current || displayedNodes.length === 0) return;
    const svg = d3.select(svgRef.current);
    const graphGroup = svgRef.current.querySelector("g");
    if (!graphGroup) { svg.transition().duration(400).call(zoomRef.current.transform as never, d3.zoomIdentity); return; }
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const bounds = graphGroup.getBBox();
    const graphWidth = Math.max(1, bounds.width);
    const graphHeight = Math.max(1, bounds.height);
    const scale = Math.min(1.2, 0.8 / Math.max(graphWidth / width, graphHeight / height));
    const translateX = width / 2 - scale * (bounds.x + graphWidth / 2);
    const translateY = height / 2 - scale * (bounds.y + graphHeight / 2);
    svg.transition().duration(500).call(zoomRef.current.transform as never, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
            <Icon icon="graph" className="text-sda-accent-purple" />
            Graph View
          </h1>
          <p className="text-sm text-sda-text-secondary mt-1">
            Live satellite links only: proximity, orbital shadowing, signal interception risk, and actionable conjunctions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon="refresh" minimal onClick={() => setRefreshKey((current) => current + 1)} />
          <Button icon="zoom-in" minimal onClick={handleZoomIn} />
          <Button icon="zoom-out" minimal onClick={handleZoomOut} />
          <Button icon="zoom-to-fit" minimal onClick={handleZoomToFit} />
        </div>
      </div>

      <Callout intent="primary" className="mb-4">
        Manual ontology relations are intentionally hidden here. They are not dynamically maintained,
        so they should only come back as editable analyst annotations, not as primary graph edges.
      </Callout>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          className="bg-sda-bg-secondary border border-sda-border-default rounded px-3 py-2 text-sm text-sda-text-primary"
          value={focusSatelliteId}
          onChange={(event) => setFocusSatelliteId(event.target.value)}
        >
          <option value="all">Top live network</option>
          {focusOptions.map((node) => (
            <option key={node.id} value={node.id}>{node.label}</option>
          ))}
        </select>
        {(["all", "proximity", "orbital", "signal", "conjunction"] as GraphFilter[]).map((filterValue) => (
          <Button
            key={filterValue}
            text={filterValue === "all" ? "All Links" : EDGE_LABELS[filterValue]}
            minimal={edgeFilter !== filterValue}
            onClick={() => setEdgeFilter(filterValue)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Tag intent="primary" minimal>{displayedNodes.length} Satellites In Scope</Tag>
        <Tag minimal>{displayedEdges.length} Live Links</Tag>
        <Tag intent={highRiskNodeCount > 0 ? "warning" : "none"} minimal>{highRiskNodeCount} High Risk Assets</Tag>
        {topRiskNode && (
          <Tag intent={severityIntent(topRiskNode.riskScore >= 0.5 ? "high" : topRiskNode.riskScore >= 0.25 ? "medium" : "low")} minimal>
            Top Risk: {topRiskNode.label} ({formatPercent(topRiskNode.riskScore)})
          </Tag>
        )}
        {lastUpdated && <Tag minimal>Updated {new Date(lastUpdated).toLocaleTimeString()}</Tag>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 flex-1 min-h-0">
        <Card elevation={Elevation.TWO} className="min-h-[560px] overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-sda-bg-primary/60 z-10">
              <Spinner />
            </div>
          )}
          {displayedNodes.length === 0 || displayedEdges.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-sda-text-primary font-medium">No live satellite links in scope</p>
                <p className="text-sm text-sda-text-secondary mt-1">
                  Change the filter or wait for the next refresh if detections are still running.
                </p>
              </div>
            </div>
          ) : (
            <svg ref={svgRef} className="w-full h-full min-h-[560px]" />
          )}
        </Card>

        <Card elevation={Elevation.ONE} className="p-4 overflow-auto">
          {!selectedNode && !selectedEdge && (
            <div>
              <h2 className="text-lg font-semibold text-sda-text-primary mb-2">Operational View</h2>
              <p className="text-sm text-sda-text-secondary mb-4">
                This graph is centered on why assets are linked right now, not on static ontology records.
              </p>
              <div className="space-y-2 text-sm text-sda-text-secondary">
                <div>Blue nodes are allied or protected satellites.</div>
                <div>Red nodes are hostile or adversary satellites.</div>
                <div>Node size and inner label reflect current fleet risk.</div>
                <div>Click a node for asset context or an edge for the operational reason behind the link.</div>
              </div>
            </div>
          )}

          {selectedNode && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-semibold text-sda-text-primary">{selectedNode.label}</h2>
                <Tag intent={severityIntent(selectedNode.riskScore >= 0.5 ? "high" : selectedNode.riskScore >= 0.25 ? "medium" : "low")}>
                  {formatPercent(selectedNode.riskScore)} risk
                </Tag>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Tag minimal>{selectedNode.faction}</Tag>
                  {selectedNode.country && <Tag minimal>{selectedNode.country}</Tag>}
                  {selectedNode.orbitType && <Tag minimal>{selectedNode.orbitType}</Tag>}
                </div>
                {selectedNode.operator && <div><div className="text-sda-text-secondary">Operator</div><div className="text-sda-text-primary">{selectedNode.operator}</div></div>}
                <div><div className="text-sda-text-secondary">Direct links</div><div className="text-sda-text-primary">{selectedNode.directConnections}</div></div>
                <div>
                  <div className="text-sda-text-secondary mb-1">Live link counts</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(selectedNode.issueCounts).map(([kind, count]) => (
                      <Tag key={kind} minimal>{EDGE_LABELS[kind as EdgeKind]}: {count}</Tag>
                    ))}
                  </div>
                </div>
                {Object.keys(selectedNode.riskComponents).length > 0 && (
                  <div>
                    <div className="text-sda-text-secondary mb-1">Risk components</div>
                    <div className="space-y-1">
                      {Object.entries(selectedNode.riskComponents).sort((l, r) => r[1] - l[1]).map(([component, value]) => (
                        <div key={component} className="flex items-center justify-between">
                          <span className="text-sda-text-secondary">{component}</span>
                          <span className="text-sda-text-primary">{formatPercent(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedNode.tags.length > 0 && (
                  <div>
                    <div className="text-sda-text-secondary mb-1">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedNode.tags.map((tag) => <Tag key={tag} minimal>{tag}</Tag>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedEdge && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-semibold text-sda-text-primary">{selectedEdge.label}</h2>
                <Tag intent={severityIntent(selectedEdge.severity)}>{selectedEdge.severity.toUpperCase()}</Tag>
              </div>
              <p className="text-sm text-sda-text-primary mb-4">{selectedEdge.summary}</p>
              <div className="space-y-2">
                {selectedEdge.details.map((detail) => (
                  <div key={`${selectedEdge.id}-${detail.label}`} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-sda-text-secondary">{detail.label}</span>
                    <span className="text-sda-text-primary text-right">{detail.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
