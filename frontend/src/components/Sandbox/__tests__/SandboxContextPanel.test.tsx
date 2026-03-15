// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GroundStation, PositionReport, SatelliteDetail } from "@/lib/api";
import { SandboxContextPanel } from "../SandboxContextPanel";

function buildSatellite(index: number, name: string): SatelliteDetail {
  return {
    id: `sat-${index}`,
    norad_id: 70_000 + index,
    name,
    object_type: "PAYLOAD",
    is_active: true,
    classification: "unclassified",
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    relations: [],
  };
}

function buildGroundStation(index: number): GroundStation {
  return {
    id: `station-${index}`,
    name: `Ground Station ${index}`,
    latitude: 10 + index,
    longitude: 20 + index,
    altitude_m: 100,
    antenna_count: 2,
    frequency_bands: ["X"],
    is_operational: true,
  };
}

function buildGroundVehicle(index: number): PositionReport {
  return {
    id: `vehicle-${index}`,
    entity_id: `vehicle-${index}`,
    entity_type: "ground_vehicle",
    report_time: "2026-01-01T00:00:00Z",
    latitude: 30 + index,
    longitude: 40 + index,
    is_simulated: false,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("SandboxContextPanel", () => {
  it("shows drone templates in the force library", () => {
    render(
      <SandboxContextPanel
        tab="actors"
        onTabChange={vi.fn()}
        actors={[]}
        selectedActorId={null}
        currentSessionId={null}
        interactionMode="idle"
        liveSatellites={[]}
        liveStations={[]}
        liveVehicles={[]}
        liveConjunctions={[]}
        onSelectActor={vi.fn()}
        onFlyToActor={vi.fn()}
        onDeleteActor={vi.fn()}
        onSaveActor={vi.fn()}
        onRelocateActor={vi.fn()}
        onSetMoveTarget={vi.fn()}
        onSetInteractionMode={vi.fn()}
        onImportLive={vi.fn()}
        onImportTLE={vi.fn()}
        onLoadSession={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /recon drone/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /hostile drone/i })).toBeTruthy();
  });

  it("renders all filtered satellites without truncating the import list", () => {
    const liveSatellites = [
      ...Array.from({ length: 18 }, (_, index) =>
        buildSatellite(
          index + 1,
          `Match Satellite ${String(index + 1).padStart(2, "0")}`,
        ),
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        buildSatellite(index + 101, `Other Satellite ${index + 1}`),
      ),
    ];

    render(
      <SandboxContextPanel
        tab="import"
        onTabChange={vi.fn()}
        actors={[]}
        selectedActorId={null}
        currentSessionId={null}
        interactionMode="idle"
        liveSatellites={liveSatellites}
        liveStations={[buildGroundStation(1)]}
        liveVehicles={[buildGroundVehicle(1)]}
        liveConjunctions={[]}
        onSelectActor={vi.fn()}
        onFlyToActor={vi.fn()}
        onDeleteActor={vi.fn()}
        onSaveActor={vi.fn()}
        onRelocateActor={vi.fn()}
        onSetMoveTarget={vi.fn()}
        onSetInteractionMode={vi.fn()}
        onImportLive={vi.fn()}
        onImportTLE={vi.fn()}
        onLoadSession={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Filter catalog..."), {
      target: { value: "match satellite" },
    });

    expect(
      screen.getAllByRole("button", { name: /match satellite/i }),
    ).toHaveLength(18);
    expect(
      screen.getByRole("button", { name: /match satellite 18/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /other satellite 1/i }),
    ).toBeNull();
  });
});
