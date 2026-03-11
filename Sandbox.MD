# Sandbox Plan

## Status

Planning document only. No implementation starts from this file until explicit confirmation.

## Objective

Create a real chat-driven sandbox where a user can:

- create satellites, bases, vehicles, aircraft, ships, missiles, and sensors
- place assets at user-defined coordinates or orbital parameters
- make those assets perform actions over time
- simulate behaviors such as satellite maneuvers, ground movement, and base-driven air defence
- do all of this in an isolated sandbox workspace, not in the normal live map view
- configure the sandbox either by prompting the agent or by manually dragging and dropping selected data into the workspace

## Current State

The current simulation experience is mostly pre-scripted and fake:

- the main simulation mode is a hard-coded scenario
- behavior is authored in frontend hooks instead of a generic runtime
- some chat flows can create entities, but the paths are inconsistent
- some simulation tools only emit Cesium actions and do not persist or execute a real scenario lifecycle

This means the current simulation is useful as a demo, but not yet as a per-user sandbox.

## Preservation Rule

The current scripted simulation stays.

This sandbox effort must not delete or replace the existing simulation experience.

Target outcome:

- keep the current simulation for demo / showcase / scripted mission use
- add Sandbox as a separate custom scenario workspace
- let both systems exist in parallel
- do not migrate or remove the existing simulation unless explicitly decided later

## Core Decision

The sandbox must not be another scripted scene.

It must be built as:

- `session + actors + behaviors + triggers + tick engine`

Chat should define and modify structured scenario state.
The runtime should execute that state deterministically.

The LLM should not directly improvise frame-by-frame simulation behavior.

## Page Strategy

All sandbox work must happen in a new dedicated page.

Proposed route:

- `frontend/src/app/(main)/sandbox/page.tsx`

Requirements:

- this page uses the existing Cesium stack
- do not build a second Cesium implementation
- do not duplicate heavy viewer infrastructure
- reuse the existing `CesiumViewer`, `cesiumController`, and common layers where possible

Important constraint:

- only one Cesium viewer should be active in the page at a time
- the Sandbox page should load a clean map workspace, ready to be modified by chat
- the normal map page remains operational/live-focused
- the Sandbox page is the mutable what-if workspace

## Map Page to Sandbox Handoff

The normal chat on the map page should be able to hand the user into Sandbox mode when requested.

Expected flow:

1. User asks on the normal map page for a sandbox or custom simulation.
2. Chat detects this intent.
3. Chat offers or triggers navigation to the Sandbox page.
4. The Sandbox page opens with a clean Cesium workspace.
5. The original request is passed into Sandbox as initial context.
6. From that point on, asset creation and scenario authoring happen inside Sandbox.

Possible handoff payload:

- initial prompt
- pending operation draft
- sandbox session id
- selected context assets from the map page
- selected data prepared for drag-and-drop into Sandbox

This avoids polluting the live map workflow with mutable simulation state.

## Document Role

This file should be treated as the primary execution brief for the Sandbox effort.

Another agent with no prior context should be able to use this file to understand:

- what Sandbox is
- what must be preserved
- what must be added
- where it should live in the product
- how chat and manual workflows must coexist
- what the initial implementation phases are
- what constraints must not be violated

This document should remain implementation-oriented enough to guide delivery, while still being a plan rather than code.

## Interaction Model

Sandbox must support two equal ways of authoring scenarios:

- agent-driven authoring through chat tool calls
- manual interactive authoring through drag-and-drop and direct manipulation

These are not separate products. They must operate on the same sandbox session and the same actor model.

### Agent-driven path

The chatbot agent should be able to:

- create actors
- assign behaviors
- modify routes
- set triggers
- create defence zones
- launch or stop scenario execution
- edit or delete previously created sandbox elements

### Manual path

The user should also be able to do this without prompting the agent, by using drag-and-drop and direct UI controls.

Minimum manual interaction goals:

- drag selected satellites or assets from existing lists into Sandbox
- drag ground assets, bases, and threat objects into the map
- drop assets into specific coordinates or onto selected zones
- adjust routes, targets, and behaviors interactively
- edit or remove sandbox actors after placement

### Shared model requirement

If the user creates something manually, the agent must understand it.

If the agent creates something with tool calls, the user must be able to edit it manually.

That means:

- one shared sandbox session state
- one shared actor representation
- one shared behavior / trigger representation

## Platform-Wide Import Requirement

Sandbox must be able to ingest and use all platform data categories that are needed to make actions real.

This means the selective import / drag-and-drop workflow should eventually support everything the platform exposes, not just a narrow subset.

Target scope:

- satellites
- debris
- ground stations
- ground vehicles
- military vehicles
- aircraft
- ships
- conjunction targets
- proximity threats
- hostile / adversary-tracked objects
- incidents
- operations
- launch-correlated objects
- reentry objects
- RF / comms-related objects when meaningful
- space-weather conditions or events when meaningful
- any future platform object that participates in operational or simulated workflows

Important distinction:

- some platform items are actors
- some platform items are events
- some platform items are analytical overlays

Sandbox must support all three, but they do not all map the same way.

### Mapping rule

If a live platform item is dragged into Sandbox:

- actor-like items become sandbox actors
- event-like items become sandbox scenario events, triggers, or seeded situations
- analytical items become sandbox overlays, environmental modifiers, or scenario parameters

Examples:

- dragging a live satellite creates a cloned sandbox satellite actor
- dragging a conjunction creates a seeded close-approach scenario between sandbox actors
- dragging a threat creates a seeded hostile behavior or trigger package
- dragging a space-weather event creates an environmental modifier for the sandbox runtime

The live platform data must remain untouched.
Sandbox always works on cloned or adapted sandbox-local state.

## Testing Principle

The sandbox should be designed to test everything.

The user must be able to validate the whole feature set in both ways:

- by prompting the agent
- by using the manual drag-and-drop workflow

This should be treated as a design constraint, not an optional UI enhancement.

Examples:

- create a base by prompt, then move or edit it manually
- drag a live satellite selection into Sandbox, then ask the agent to assign a behavior
- create an air-defence scenario manually, then ask the agent to modify engagement logic
- create a satellite maneuver by prompt, then inspect and adjust it through UI

Expanded testing principle:

- if the platform can display or reason over an object, Sandbox should aim to let the user pull that object into a scenario
- if the platform can analyze an event, Sandbox should aim to let the user recreate or perturb that event
- if the platform can track an asset, Sandbox should aim to let the user turn that asset into an actor under simulated control

## Product Scope

### MVP

Support chat-driven creation and control of:

- bases / ground stations
- ground vehicles
- aircraft
- ships
- satellites
- threat actors
- defended zones
- interceptors / missiles

Support manual selective-data authoring:

- drag and drop selected live data into Sandbox
- drag and drop new sandbox actor templates into the map
- interactively edit placed actors
- mix manual and agent-driven authoring in the same scenario

MVP note:

- v1 can phase delivery of platform-wide import support, but the architecture must be designed for full platform coverage from the start
- do not hard-code Sandbox around satellites only

Support basic actions:

- create
- remove
- move
- patrol
- hold position
- follow route
- detect target
- track target
- launch interceptor
- satellite burn / maneuver
- observe target
- jam target
- enable or disable coverage
- pause / resume / reset scenario

### Not MVP

Do not try to solve all of this in v1:

- full high-fidelity orbital mechanics for every actor
- full weapon-system realism
- large-scale autonomous swarm simulation
- blending sandbox data directly into the live operational catalog

## Simulation Model

### 1. Sandbox Session

Each user sandbox should be isolated.

Suggested concept:

- `sandbox_session`
  - id
  - tenant_id
  - user_id
  - name
  - status
  - created_at
  - updated_at
  - saved / ephemeral flag

This must be separate from the live operational state.

### 2. Actors

Each sandbox contains actors.

Suggested actor classes:

- orbital actor
  - real satellite, debris-like target, hostile satellite
- fixed ground actor
  - base, radar, SAM site, command center, ground station
- mobile ground actor
  - vehicle, convoy, launcher
- air actor
  - aircraft, drone, interceptor
- sea actor
  - ship
- weapon / effect actor
  - missile, interceptor, jammer, sensor cone, defended zone

Each actor needs:

- id
- session_id
- type
- subtype
- faction
- label
- visual config
- state
- capabilities
- provenance
  - live-cloned
  - manually-created
  - agent-created

Provenance is important so that Sandbox can support selective import from live data and mixed editing flows.

### 2B. Imported Non-Actor Objects

Not every imported object should become a free-moving actor.

Some imports should become:

- seeded events
- environmental modifiers
- overlays
- scenario constraints
- mission objectives

Examples:

- conjunction import -> event seed or trigger set
- incident import -> mission objective or scenario context
- space weather import -> runtime modifier
- threat import -> hostile intent package

### 3. State Model

Ground / air / sea actors can use:

- lat
- lon
- alt
- heading
- speed

Orbital actors must not be defined by a single map coordinate only.

Orbital actors should be created from one of:

- simplified orbital elements
  - altitude
  - inclination
  - RAAN
  - anomaly
  - epoch
- full orbital elements
- state vector at epoch
- imported TLE

If the user only gives a coordinate for a satellite, chat must either:

- ask for the missing orbital parameters, or
- create a clearly marked pseudo-satellite actor in simplified mode

### 4. Behaviors

Behaviors should be structured and deterministic.

Examples:

- `hold`
- `move_to`
- `follow_waypoints`
- `patrol_loop`
- `orbit_keep`
- `perform_burn`
- `approach_target`
- `maintain_distance`
- `observe_target`
- `jam_target`
- `detect_track_engage`
- `launch_interceptor`
- `return_to_base`

### 5. Triggers

Examples:

- at time T
- when actor enters zone
- when target range < X
- when hostile detected
- when satellite reaches anomaly window
- when intercept failed

### 6. Tick Engine

The runtime should execute scenario state on a time step.

It should:

- advance actors
- evaluate triggers
- apply behavior logic
- emit updated state
- drive Cesium updates

This is the main difference between a real sandbox and a pre-scripted frontend demo.

## Use Cases To Support

### Satellite actions

- create allied satellite in LEO
- create hostile inspector satellite
- command approach to target
- simulate avoidance burn
- switch to surveillance posture
- create coverage over region
- drag a selected live satellite into Sandbox as a cloned actor
- let the agent attach behaviors to a manually dropped actor

### Ground movement

- create vehicle at base
- move convoy along route
- patrol perimeter
- send launcher to new point
- drag a vehicle or base template into the map and adjust it manually

### Air defence from a base

- create SAM or air-defence base at coordinates
- define defended radius and engagement envelope
- spawn hostile aircraft or missile
- detect, track, launch interceptor
- resolve intercept
- display defended zone and attack timeline
- allow the user to place the base manually and then ask the agent to configure defence behavior

This is viable with simplified deterministic mechanics before adding high-fidelity modeling.

### Full platform testing

The Sandbox should support workflows like:

- take a live conjunction and turn it into a what-if branch
- take a live satellite and clone it into a sandbox mission
- take a live ground station and build a defended scenario around it
- take a threat detection output and convert it into a hostile actor behavior
- take a reentry event and test alternate response timelines
- take space-weather conditions and evaluate operational degradation in a custom scenario

## Architecture Direction

### Frontend

Create a new Sandbox page that reuses the existing Cesium stack.

Suggested composition:

- `frontend/src/app/(main)/sandbox/page.tsx`
- reuse `frontend/src/components/CesiumMap/CesiumViewer.tsx`
- reuse `frontend/src/lib/cesium/controller.ts`
- add sandbox-specific layers and panels
- add a sandbox-specific store for session state

The Sandbox page should start visually clean:

- no live debris flood by default
- no live conjunction overlays by default
- no operational clutter by default
- only sandbox actors and requested helper layers

The Sandbox page should also expose a selective import / drop workflow:

- pick live objects from existing data panels or search
- drag them into Sandbox as cloned sandbox actors
- keep the live system untouched
- make the dropped copies editable

It should also support import adapters for non-actor platform data:

- drag events into a scenario timeline or setup panel
- drag analytical objects into a modifier / overlay area
- drag threat outputs into hostile-behavior setup

### Backend

Add a dedicated sandbox domain instead of overloading live ontology objects.

Suggested backend shape:

- sandbox session API
- sandbox actor API
- sandbox behavior / command API
- sandbox tick / state stream API
- chat-to-sandbox command compiler
- import adapter layer from platform objects to sandbox-local objects or modifiers

Important:

- do not use the current scripted simulation hooks as the backend model
- do not write sandbox entities directly into the shared live catalog as the main persistence model

### Current Code Anchors

These are the main existing areas another agent should inspect before implementation:

- map page
  - `frontend/src/app/(main)/map/page.tsx`
- existing Cesium viewer stack
  - `frontend/src/components/CesiumMap/CesiumViewer.tsx`
  - `frontend/src/lib/cesium/controller.ts`
- current scripted simulation hooks
  - `frontend/src/lib/simulation/useItalyDefenseSimulation.ts`
  - `frontend/src/lib/simulation/useSARSimulation.ts`
- existing simulation API
  - `backend/app/api/v1/simulation.py`
  - `backend/app/schemas/simulation.py`
- current chat orchestration and tool-call logic
  - `backend/app/services/ai.py`
  - `frontend/src/components/Chat/AgentChat.tsx`
  - `frontend/src/lib/sse-client.ts`
- existing dormant sandbox-ish frontend state
  - `frontend/src/lib/store/simulation.ts`
  - `frontend/src/lib/api/simulation.ts`

These files are important starting points, but they should not force the architecture into the old scripted-simulation model.

### Chat Integration

Chat should support:

- create actor requests
- assign behaviors
- modify rules
- start / stop / pause / reset sandbox
- navigate from normal map page into Sandbox
- understand manually created and manually edited sandbox actors
- operate as a co-pilot for a manually assembled scenario

Recommended approach:

- map-page chat detects sandbox intent
- it navigates into Sandbox with a structured handoff
- sandbox chat becomes the primary authoring surface
- manual drag-and-drop remains available at all times as a parallel authoring surface

### Manual Import Surface

Sandbox should expose a unified import surface for:

- dragging selected assets from lists or cards
- dropping them onto the map
- dropping them onto timeline / modifier / objective zones when they are non-actor objects

The UI should make it obvious whether the drop result will create:

- an actor
- an event
- a modifier
- an overlay

## Execution Strategy

### Phase 1: Sandbox Workspace

- add Sandbox page route
- reuse the existing Cesium viewer stack
- load a clean map workspace
- wire chat handoff from map page to Sandbox
- preserve the existing scripted simulation untouched
- document and enforce the one-viewer rule

### Phase 2: Session-Isolated State

- add sandbox session model
- add sandbox actor model
- add sandbox-only storage and APIs
- keep sandbox isolated from live data
- support cloned imports from live objects into sandbox-local actors
- add adapters for events, threats, and analytical objects

### Phase 3: Actor Creation

- create bases, vehicles, aircraft, ships
- create simplified satellites
- add faction, labels, capabilities, coverage visualization
- add manual drag-and-drop placement and editing
- add actor provenance and selective import flow
- add import mapping for all major platform object types

### Phase 4: Behavior Engine

- add waypoint movement
- add triggers and action scheduling
- add simple engagement logic
- add pause / resume / reset / speed control
- make all state changes editable from both chat and manual controls
- ensure imported events and overlays can influence runtime behavior

### Phase 5: Orbital and Defence Logic

- orbital state propagation
- satellite maneuvers
- proximity / approach behaviors
- air-defence detection and intercept resolution
- environmental modifiers from imported platform data

### Phase 6: Chat Compiler

- chat converts natural language into structured sandbox commands
- confirmation step for destructive or large multi-asset operations
- replayable command history per sandbox session
- tool-call outputs remain fully editable through manual UI after creation
- imported platform objects can be referenced directly in chat after drop / clone

### Phase 7: Platform Coverage Expansion

- complete import support for all platform object categories
- normalize actor / event / modifier imports under one adapter system
- ensure every major page or panel that exposes actionable data can hand objects into Sandbox

## Dev Workflow

Use the existing Docker development flow.

Rules:

- frontend runs hot-reload in dev mode
- backend runs with reload in dev mode
- do not create an alternate local workflow for this feature
- do not spin up a second Cesium app or duplicate the map stack

Operational note:

- the repo already supports Docker hot reload
- prefer that workflow while building Sandbox
- only restart containers when required by the current workflow or when dependencies change

Reference:

- `FRONTEND_MODE=dev docker-compose up -d`

Do not auto-start Docker containers from automation if the user has not asked for that.

Whenever implementation work begins:

- use the existing hot-reload Docker workflow
- restart frontend and backend when changes require it under the current project rules
- keep the Sandbox work inside the shared app rather than splitting out a separate heavy frontend

## Commit Discipline

Commit only when changes are consistent.

That means:

- the change set is coherent
- the page or API path is internally consistent
- types and interfaces line up
- the affected flow is validated
- no partial “half-wired” commits for route, API, and chat handoff

Suggested rule:

- one commit per consistent milestone
- avoid mixing sandbox architecture, unrelated cleanup, and cosmetic changes

Suggested milestone boundaries:

- route + clean sandbox page shell
- sandbox session state + API skeleton
- first actor import and placement flow
- chat handoff and sandbox tool-call path
- first runtime behavior engine
- first defence / maneuver scenario end-to-end

## Risks

- mixing sandbox entities with live catalog entities
- letting chat directly mutate Cesium without a stable scenario model
- creating a second heavy Cesium map implementation
- overcommitting to high-fidelity physics too early
- unclear boundary between simplified pseudo-satellite behavior and true orbital behavior
- building chat and manual workflows on different underlying models
- importing live data into Sandbox without clear clone semantics
- importing every platform data type without a clear actor / event / modifier mapping
- building a partial architecture that cannot scale to full platform object coverage

## Open Questions

1. Should Sandbox sessions be ephemeral by default, or saved and reloadable?
2. Should a user be able to import live satellites into Sandbox as cloned actors?
3. For v1, do we allow simplified pseudo-satellites, or only physically defined orbital actors?
4. Should the route be exactly `/sandbox`, or should Sandbox be nested under `/map`?
5. Should map-page chat automatically navigate to Sandbox, or ask for confirmation first?
6. Should air-defence logic in v1 be deterministic and simplified, or probabilistic with configurable kill probability?
7. Do we want multiplayer/shared sandbox sessions later, or should the model remain strictly per-user for now?
8. Which live data panels should support drag-and-drop into Sandbox first: satellites only, or also stations, vehicles, debris, conjunctions, and threats?

Current direction from product discussion:

- aim for all platform object categories, not a small subset
- if phased delivery is needed, sequence it, but keep the architecture universal

## Recommendation

Proceed with a dedicated Sandbox page and isolated sandbox session model.

Do not extend the current fake scripted simulation directly, and do not remove it.

Reuse the existing Cesium viewer stack, but move mutable scenario authoring into a clean sandbox workspace with deterministic runtime state.

Design Sandbox so that every major feature can be tested both through agent prompting and through manual drag-and-drop / direct editing.

Design it so another agent can implement from this document without assuming:

- the old scripted simulation should be replaced
- a second Cesium stack should be created
- only satellites matter
- chat-only interaction is sufficient
