import { getCesium, type CesiumModule } from './loader';

export interface CesiumAction {
  type: 'cesium.setClock' | 'cesium.loadCzml' | 'cesium.addEntity' | 'cesium.flyTo' | 'cesium.flyToCountry' | 'cesium.searchLocation' | 'cesium.toggle' | 'cesium.removeLayer' | 'cesium.setSelected';
  payload: Record<string, unknown>;
}

export interface CesiumSceneState {
  camera: {
    longitude: number;
    latitude: number;
    altitude: number;
    heading: number;
    pitch: number;
    roll: number;
  };
  clock: {
    currentTime: string;
    startTime: string;
    stopTime: string;
    multiplier: number;
  };
  entities: {
    satellites: number;
    groundStations: number;
    other: number;
  };
}

type ActionHandler = (payload: Record<string, unknown>, Cesium: CesiumModule) => void;

class CesiumControllerClass {
  private viewer: InstanceType<CesiumModule['Viewer']> | null = null;
  private actionHandlers: Map<string, ActionHandler> = new Map();
  private eventListeners: Map<string, Set<(action: CesiumAction) => void>> = new Map();
  private isFlying: boolean = false;
  private Cesium: CesiumModule | null = null;

  async initialize(viewer: InstanceType<CesiumModule['Viewer']>): Promise<void> {
    this.viewer = viewer;
    this.Cesium = await getCesium();
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    this.registerHandler('cesium.setClock', this.handleSetClock.bind(this));
    this.registerHandler('cesium.loadCzml', this.handleLoadCzml.bind(this));
    this.registerHandler('cesium.addEntity', this.handleAddEntity.bind(this));
    this.registerHandler('cesium.flyTo', this.handleFlyTo.bind(this));
    this.registerHandler('cesium.flyToCountry', this.handleFlyToCountry.bind(this));
    this.registerHandler('cesium.searchLocation', this.handleSearchLocation.bind(this));
    this.registerHandler('cesium.toggle', this.handleToggle.bind(this));
    this.registerHandler('cesium.removeLayer', this.handleRemoveLayer.bind(this));
    this.registerHandler('cesium.setSelected', this.handleSetSelected.bind(this));
  }

  // Country coordinates lookup table
  private countryCoordinates: Record<string, { lat: number; lon: number }> = {
    'Italy': { lat: 41.8719, lon: 12.5674 },
    'Nigeria': { lat: 9.0820, lon: 8.6753 },
    'United States': { lat: 37.0902, lon: -95.7129 },
    'USA': { lat: 37.0902, lon: -95.7129 },
    'France': { lat: 46.2276, lon: 2.2137 },
    'Germany': { lat: 51.1657, lon: 10.4515 },
    'Spain': { lat: 40.4637, lon: -3.7492 },
    'United Kingdom': { lat: 55.3781, lon: -3.4360 },
    'UK': { lat: 55.3781, lon: -3.4360 },
    'China': { lat: 35.8617, lon: 104.1954 },
    'Japan': { lat: 36.2048, lon: 138.2529 },
    'India': { lat: 20.5937, lon: 78.9629 },
    'Brazil': { lat: -14.2350, lon: -51.9253 },
    'Russia': { lat: 61.5240, lon: 105.3188 },
    'Australia': { lat: -25.2744, lon: 133.7751 },
    'Canada': { lat: 56.1304, lon: -106.3468 },
    'Mexico': { lat: 23.6345, lon: -102.5528 },
    'South Africa': { lat: -30.5595, lon: 22.9375 },
    'Egypt': { lat: 26.0975, lon: 30.0444 },
    'Kenya': { lat: -1.2921, lon: 36.8219 },
    'Argentina': { lat: -38.4161, lon: -63.6167 },
    'Chile': { lat: -35.6751, lon: -71.5430 },
    'Indonesia': { lat: -0.7893, lon: 113.9213 },
    'Thailand': { lat: 15.8700, lon: 100.9925 },
    'Turkey': { lat: 38.9637, lon: 35.2433 },
    'Saudi Arabia': { lat: 23.8859, lon: 45.0792 },
    'UAE': { lat: 23.4241, lon: 53.8478 },
  };

  registerHandler(actionType: string, handler: ActionHandler): void {
    this.actionHandlers.set(actionType, handler);
  }

  on(actionType: string, callback: (action: CesiumAction) => void): void {
    if (!this.eventListeners.has(actionType)) {
      this.eventListeners.set(actionType, new Set());
    }
    this.eventListeners.get(actionType)!.add(callback);
  }

  off(actionType: string, callback: (action: CesiumAction) => void): void {
    this.eventListeners.get(actionType)?.delete(callback);
  }

  dispatch(action: CesiumAction): void {
    const handler = this.actionHandlers.get(action.type);
    if (handler && this.Cesium) {
      handler(action.payload, this.Cesium);
    }

    this.eventListeners.get(action.type)?.forEach(callback => callback(action));
    this.eventListeners.get('*')?.forEach(callback => callback(action));
  }

  dispatchAll(actions: CesiumAction[]): void {
    actions.forEach(action => this.dispatch(action));
  }

  getSceneState(): CesiumSceneState {
    if (!this.viewer || !this.Cesium) {
      return {
        camera: { longitude: 0, latitude: 0, altitude: 0, heading: 0, pitch: 0, roll: 0 },
        clock: { currentTime: '', startTime: '', stopTime: '', multiplier: 1 },
        entities: { satellites: 0, groundStations: 0, other: 0 },
      };
    }

    const camera = this.viewer.camera;
    const cartesian = camera.position;
    const cartographic = this.Cesium.Cartographic.fromCartesian(cartesian);
    const clock = this.viewer.clock;

    return {
      camera: {
        longitude: this.Cesium.Math.toDegrees(cartographic.longitude),
        latitude: this.Cesium.Math.toDegrees(cartographic.latitude),
        altitude: cartographic.height,
        heading: this.Cesium.Math.toDegrees(camera.heading),
        pitch: this.Cesium.Math.toDegrees(camera.pitch),
        roll: this.Cesium.Math.toDegrees(camera.roll),
      },
      clock: {
        currentTime: clock.currentTime ? this.Cesium.JulianDate.toIso8601(clock.currentTime) : new Date().toISOString(),
        startTime: clock.startTime ? this.Cesium.JulianDate.toIso8601(clock.startTime) : new Date().toISOString(),
        stopTime: clock.stopTime ? this.Cesium.JulianDate.toIso8601(clock.stopTime) : new Date().toISOString(),
        multiplier: clock.multiplier,
      },
      entities: {
        satellites: this.viewer.entities.values.filter(e => e.properties?.objectType?.getValue() === 'satellite').length,
        groundStations: this.viewer.entities.values.filter(e => e.properties?.objectType?.getValue() === 'ground_station').length,
        other: this.viewer.entities.values.length,
      },
    };
  }

  private handleSetClock(payload: Record<string, unknown>, Cesium: CesiumModule): void {
    if (!this.viewer) return;

    const start = payload.start as string;
    const stop = payload.stop as string;
    const multiplier = payload.multiplier as number | undefined;
    const current = payload.current as string | undefined;

    const clock = this.viewer.clock;

    if (start) {
      clock.startTime = Cesium.JulianDate.fromDate(new Date(start));
    }
    if (stop) {
      clock.stopTime = Cesium.JulianDate.fromDate(new Date(stop));
    }
    if (multiplier !== undefined) {
      clock.multiplier = multiplier;
    }
    if (current) {
      clock.currentTime = Cesium.JulianDate.fromDate(new Date(current));
    }

    clock.shouldAnimate = true;
  }

  private handleLoadCzml(payload: Record<string, unknown>, Cesium: CesiumModule): void {
    if (!this.viewer) return;

    const layerId = payload.layerId as string;
    const data = payload.data as any;

    if (data && this.viewer) {
      Cesium.CzmlDataSource.load(data).then(dataSource => {
        if (this.viewer) {
          this.viewer.dataSources.add(dataSource);
          (dataSource as any).layerId = layerId;
        }
      }).catch(error => {
        console.error('Failed to load CZML:', error);
      });
    }
  }

  private handleAddEntity(payload: Record<string, unknown>, Cesium: CesiumModule): void {
    if (!this.viewer) return;

    const entityType = payload.entityType as string;
    const name = payload.name as string;
    const position = payload.position as { longitude: number; latitude: number; altitude?: number };
    const properties = payload.properties as Record<string, unknown> | undefined;

    const positionCartesian = Cesium.Cartesian3.fromDegrees(
      position.longitude,
      position.latitude,
      position.altitude || 0
    );

    const entity = this.viewer.entities.add({
      name,
      position: positionCartesian,
    });

    switch (entityType) {
      case 'satellite':
        entity.point = new Cesium.PointGraphics({
          pixelSize: new Cesium.ConstantProperty(10),
          color: new Cesium.ConstantProperty(Cesium.Color.CYAN),
          outlineColor: new Cesium.ConstantProperty(Cesium.Color.WHITE),
          outlineWidth: new Cesium.ConstantProperty(2),
        });
        entity.label = new Cesium.LabelGraphics({
          text: new Cesium.ConstantProperty(name),
          font: new Cesium.ConstantProperty('14px sans-serif'),
          fillColor: new Cesium.ConstantProperty(Cesium.Color.CYAN),
          outlineColor: new Cesium.ConstantProperty(Cesium.Color.BLACK),
          outlineWidth: new Cesium.ConstantProperty(2),
          style: new Cesium.ConstantProperty(Cesium.LabelStyle.FILL_AND_OUTLINE),
          verticalOrigin: new Cesium.ConstantProperty(Cesium.VerticalOrigin.BOTTOM),
          pixelOffset: new Cesium.ConstantProperty(new Cesium.Cartesian2(0, -10)),
        });
        break;

      case 'ground_station':
        entity.point = new Cesium.PointGraphics({
          pixelSize: new Cesium.ConstantProperty(12),
          color: new Cesium.ConstantProperty(Cesium.Color.LIME),
          outlineColor: new Cesium.ConstantProperty(Cesium.Color.WHITE),
          outlineWidth: new Cesium.ConstantProperty(2),
        });
        entity.label = new Cesium.LabelGraphics({
          text: new Cesium.ConstantProperty(name),
          font: new Cesium.ConstantProperty('12px sans-serif'),
          fillColor: new Cesium.ConstantProperty(Cesium.Color.LIME),
          outlineColor: new Cesium.ConstantProperty(Cesium.Color.BLACK),
          outlineWidth: new Cesium.ConstantProperty(2),
          style: new Cesium.ConstantProperty(Cesium.LabelStyle.FILL_AND_OUTLINE),
          verticalOrigin: new Cesium.ConstantProperty(Cesium.VerticalOrigin.BOTTOM),
          pixelOffset: new Cesium.ConstantProperty(new Cesium.Cartesian2(0, -10)),
        });
        break;

      case 'point':
        entity.point = new Cesium.PointGraphics({
          pixelSize: new Cesium.ConstantProperty((properties?.pixelSize as number) || 8),
          color: new Cesium.ConstantProperty((properties?.color as any) || Cesium.Color.YELLOW),
        });
        break;

      case 'polygon':
        entity.polygon = new Cesium.PolygonGraphics({
          hierarchy: new Cesium.PolygonHierarchy([positionCartesian]),
          material: (properties?.material as any) || Cesium.Color.RED.withAlpha(0.5),
        });
        break;

      case 'polyline':
        entity.polyline = new Cesium.PolylineGraphics({
          positions: [positionCartesian],
          width: (properties?.width as number) || 2,
          material: (properties?.material as any) || Cesium.Color.YELLOW,
        });
        break;
    }

    if (properties) {
      if (!entity.properties) {
        entity.properties = new Cesium.PropertyBag();
      }
      Object.entries(properties).forEach(([key, value]) => {
        if (key !== 'color' && key !== 'pixelSize' && key !== 'width' && key !== 'material') {
          entity.properties!.addProperty(key, value);
        }
      });
    }

    if (!entity.properties) {
      entity.properties = new Cesium.PropertyBag();
    }
    entity.properties.addProperty('objectType', entityType);
  }

  private handleFlyTo(payload: Record<string, unknown>, Cesium: CesiumModule): void {
    if (!this.viewer || this.isFlying) return;

    const entityId = payload.entityId as string | undefined;
    const longitude = payload.longitude as number | undefined;
    const latitude = payload.latitude as number | undefined;
    const altitude = payload.altitude as number | undefined;
    const heading = payload.heading as number | undefined;
    const pitch = payload.pitch as number | undefined;
    const roll = payload.roll as number | undefined;
    const duration = (payload.duration as number) || 1.5;

    this.isFlying = true;

    const completeFly = () => {
      setTimeout(() => { this.isFlying = false; }, (duration || 1.5) * 1000 + 200);
    };

    if (entityId) {
      const entity = this.viewer.entities.getById(entityId);
      if (entity) {
        this.viewer.flyTo(entity, {
          duration,
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(heading || 0),
            Cesium.Math.toRadians(pitch || -45),
            altitude || 10000
          ),
}); completeFly();
        // Also select the entity to show info card
        this.viewer.selectedEntity = entity;
      }
    } else if (longitude !== undefined && latitude !== undefined) {
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          longitude,
          latitude,
          altitude || 10000
        ),
        orientation: {
          heading: Cesium.Math.toRadians(heading || 0),
          pitch: Cesium.Math.toRadians(pitch || -45),
          roll: Cesium.Math.toRadians(roll || 0),
        },
        duration,
      }); completeFly();
    }
  }

  private handleFlyToCountry(payload: Record<string, unknown>, Cesium: CesiumModule): void {
    if (!this.viewer || this.isFlying) return;

    const country = payload.country as string;
    const altitude = (payload.altitude as number) || 5000000; // Default 5000km for country view
    const duration = (payload.duration as number) || 1.5;

    const coords = this.countryCoordinates[country];
    if (!coords) {
      console.warn(`Country coordinates not found for: ${country}`);
      return;
    }

    this.isFlying = true;

this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(coords.lon, coords.lat, altitude),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-90), // Top-down view
          roll: 0,
        },
        duration,
      });
      setTimeout(() => { this.isFlying = false; }, duration * 1000 + 200);
  }

  private async handleSearchLocation(payload: Record<string, unknown>, Cesium: CesiumModule): Promise<void> {
    if (!this.viewer || this.isFlying) return;

    const query = payload.query as string;
    const altitude = (payload.altitude as number) || 50000;
    const duration = (payload.duration as number) || 1.5;

    if (!query) {
      console.warn('Search query is empty');
      return;
    }

    this.isFlying = true;

    try {
      // Use Nominatim (OpenStreetMap) for geocoding - free, no API key required
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'SpaceDomainAwareness/1.0'
          }
        }
      );

      if (!response.ok) {
        console.error('Geocoding failed:', response.statusText);
        this.isFlying = false;
        return;
      }

      const data = await response.json();
      
      if (!data || data.length === 0) {
        console.warn(`Location not found: ${query}`);
        this.isFlying = false;
        return;
      }

      const result = data[0];
      const lon = parseFloat(result.lon);
      const lat = parseFloat(result.lat);

      // Fly to the location
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration,
      });
      setTimeout(() => { this.isFlying = false; }, duration * 1000 + 200);

    } catch (error) {
      console.error('Error searching location:', error);
      this.isFlying = false;
    }
  }

  private handleToggle(payload: Record<string, unknown>, Cesium: CesiumModule): void {
    if (!this.viewer) return;

    const showOrbits = payload.showOrbits as boolean | undefined;
    const showCoverage = payload.showCoverage as boolean | undefined;
    const showConjunctions = payload.showConjunctions as boolean | undefined;
    const showLabels = payload.showLabels as boolean | undefined;

    if (showOrbits !== undefined && this.viewer.scene && this.viewer.scene.globe) {
      (this.viewer.scene.globe as unknown as { showGroundOrbit?: boolean }).showGroundOrbit = showOrbits;
    }

    if (showCoverage !== undefined) {
      this.toggleCoverageLayers(showCoverage);
    }

    if (showConjunctions !== undefined) {
      this.toggleConjunctionLayers(showConjunctions);
    }

    if (showLabels !== undefined && this.viewer.scene && this.viewer.scene.globe) {
      (this.viewer.scene.globe as unknown as { showLabels?: boolean }).showLabels = showLabels;
      this.viewer.entities.values.forEach(entity => {
        if (entity.label) {
          entity.label.show = new Cesium.ConstantProperty(showLabels);
        }
      });
    }
  }

  private toggleCoverageLayers(show: boolean): void {
    if (!this.viewer) return;
    (this.viewer.dataSources as unknown as { dataSources: CesiumModule.DataSource[] }).dataSources.forEach(dataSource => {
      const layerId = (dataSource as any).layerId;
      if (layerId && layerId.includes('coverage')) {
        dataSource.show = show;
      }
    });
  }

  private toggleConjunctionLayers(show: boolean): void {
    if (!this.viewer) return;
    (this.viewer.dataSources as unknown as { dataSources: CesiumModule.DataSource[] }).dataSources.forEach(dataSource => {
      const layerId = (dataSource as any).layerId;
      if (layerId && layerId.includes('conjunction')) {
        dataSource.show = show;
      }
    });
  }

  private handleRemoveLayer(payload: Record<string, unknown>): void {
    if (!this.viewer) return;

    const layerId = payload.layerId as string;

    const dataSources = (this.viewer.dataSources as unknown as { dataSources: CesiumModule.DataSource[] }).dataSources;
    for (let i = dataSources.length - 1; i >= 0; i--) {
      const dataSource = dataSources[i];
      if ((dataSource as any).layerId === layerId) {
        this.viewer.dataSources.remove(dataSource);
        break;
      }
    }
  }

  private handleSetSelected(payload: Record<string, unknown>): void {
    if (!this.viewer) return;

    const entityId = payload.entityId as string | undefined;

    if (entityId) {
      const entity = this.viewer.entities.getById(entityId);
      if (entity) {
        this.viewer.selectedEntity = entity;
      }
    } else {
      this.viewer.selectedEntity = undefined;
    }
  }

  destroy(): void {
    this.actionHandlers.clear();
    this.eventListeners.clear();
    this.viewer = null;
    this.Cesium = null;
  }

  // Route and Trajectory Visualization
  addRoutePlan(route: {
    id: string;
    name: string;
    entityId: string;
    waypoints: Array<{
      sequenceOrder: number;
      name?: string;
      positionLat: number;
      positionLon: number;
      positionAltKm?: number;
    }>;
    trajectory?: Array<{
      time: string;
      latitude: number;
      longitude: number;
      altitudeKm: number;
    }>;
  }): CesiumModule.Entity | null {
    if (!this.viewer || !this.Cesium) return null;

    const positions = route.waypoints.map(wp =>
      this.Cesium!.Cartesian3.fromDegrees(
        wp.positionLon,
        wp.positionLat,
        (wp.positionAltKm || 0) * 1000
      )
    );

    const routeEntity = this.viewer.entities.add({
      id: `route-${route.id}`,
      name: route.name,
      polyline: {
        positions: positions,
        width: 3,
        material: new this.Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: this.Cesium.Color.CYAN,
        }),
        clampToGround: false,
      },
    });

    route.waypoints.forEach((wp, index) => {
      this.viewer!.entities.add({
        id: `route-${route.id}-wp-${index}`,
        name: wp.name || `WP ${index + 1}`,
        position: this.Cesium!.Cartesian3.fromDegrees(
          wp.positionLon,
          wp.positionLat,
          (wp.positionAltKm || 0) * 1000
        ),
        point: {
          pixelSize: 10,
          color: this.Cesium!.Color.YELLOW,
          outlineColor: this.Cesium!.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: wp.name || `WP ${index + 1}`,
          font: '12px monospace',
          fillColor: this.Cesium!.Color.YELLOW,
          outlineColor: this.Cesium!.Color.BLACK,
          outlineWidth: 2,
          style: this.Cesium!.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: this.Cesium!.VerticalOrigin.BOTTOM,
          pixelOffset: new this.Cesium!.Cartesian2(0, -15),
        },
      });
    });

    return routeEntity;
  }

  removeRoutePlan(routeId: string): void {
    if (!this.viewer) return;
    this.viewer.entities.removeById(`route-${routeId}`);
    for (let i = 0; i < 100; i++) {
      this.viewer.entities.removeById(`route-${routeId}-wp-${i}`);
    }
  }

  visualizeTrajectory(entityId: string, trajectory: Array<{
    time: string;
    latitude: number;
    longitude: number;
    altitudeKm: number;
  }>): CesiumModule.Entity | null {
    if (!this.viewer || !this.Cesium || trajectory.length === 0) return null;

    const positions = trajectory.map(t =>
      this.Cesium!.Cartesian3.fromDegrees(t.longitude, t.latitude, t.altitudeKm * 1000)
    );

    return this.viewer.entities.add({
      id: `trajectory-${entityId}`,
      polyline: {
        positions: positions,
        width: 2,
        material: new this.Cesium.PolylineDashMaterialProperty({
          color: this.Cesium.Color.CYAN.withAlpha(0.8),
        }),
      },
    });
  }

  // Formation Visualization
  addFormation(formation: {
    id: string;
    name: string;
    formationType: string;
    leaderEntityId: string;
    members: Array<{
      entityId: string;
      slotPosition: number;
      relativeX: number;
      relativeY: number;
      relativeZ: number;
    }>;
  }): void {
    if (!this.viewer || !this.Cesium) return;

    const leaderEntity = this.viewer.entities.getById(formation.leaderEntityId);
    if (!leaderEntity) return;

    const formationColor = this.getFormationColor(formation.formationType);

    formation.members.forEach(member => {
      const memberEntity = this.viewer!.entities.getById(member.entityId);
      if (memberEntity) {
        this.viewer!.entities.add({
          id: `formation-link-${formation.id}-${member.entityId}`,
          polyline: {
            positions: new this.Cesium.CallbackProperty(() => {
              if (!leaderEntity.position || !memberEntity.position) return [];
              return [leaderEntity.position.getValue(this.Cesium!.JulianDate.now())!, memberEntity.position.getValue(this.Cesium!.JulianDate.now())!];
            }, false),
            width: 1,
            material: formationColor.withAlpha(0.5),
          },
        });
      }
    });
  }

  private getFormationColor(formationType: string): any {
    if (!this.Cesium) return new (this.Cesium || window.Cesium).Color(1, 1, 1, 1);
    
    switch (formationType) {
      case 'v_shape':
        return this.Cesium.Color.LIME;
      case 'line':
        return this.Cesium.Color.CYAN;
      case 'diamond':
        return this.Cesium.Color.ORANGE;
      case 'echelon':
        return this.Cesium.Color.MAGENTA;
      case 'circle':
        return this.Cesium.Color.YELLOW;
      default:
        return this.Cesium.Color.WHITE;
    }
  }

  removeFormation(formationId: string): void {
    if (!this.viewer) return;
    for (let i = 0; i < 100; i++) {
      this.viewer.entities.removeById(`formation-link-${formationId}-${i}`);
    }
  }

  // Operation Visualization
  addOperation(operation: {
    id: string;
    name: string;
    operationType: string;
    participatingEntities: string[];
  }): CesiumModule.Entity | null {
    if (!this.viewer || !this.Cesium) return null;

    const operationColor = this.getOperationColor(operation.operationType);

    const bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } = {
      minLat: 90, maxLat: -90, minLon: 180, maxLon: -180
    };

    operation.participatingEntities.forEach(entityId => {
      const entity = this.viewer!.entities.getById(entityId);
      if (entity?.position) {
        const pos = entity.position.getValue(this.Cesium!.JulianDate.now());
        if (pos) {
          const cartographic = this.Cesium!.Cartographic.fromCartesian(pos);
          bounds.minLat = Math.min(bounds.minLat, this.Cesium!.Math.toDegrees(cartographic.latitude));
          bounds.maxLat = Math.max(bounds.maxLat, this.Cesium!.Math.toDegrees(cartographic.latitude));
          bounds.minLon = Math.min(bounds.minLon, this.Cesium!.Math.toDegrees(cartographic.longitude));
          bounds.maxLon = Math.max(bounds.maxLon, this.Cesium!.Math.toDegrees(cartographic.longitude));
        }
      }
    });

    const centerLon = (bounds.minLon + bounds.maxLon) / 2;
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const width = (bounds.maxLon - bounds.minLon) * 111000 * Math.cos(this.Cesium!.Math.toRadians(centerLat));
    const height = (bounds.maxLat - bounds.minLat) * 111000;

    return this.viewer.entities.add({
      id: `operation-${operation.id}`,
      name: operation.name,
      position: this.Cesium!.Cartesian3.fromDegrees(centerLon, centerLat),
      ellipse: {
        semiMinorAxis: Math.max(width, height) / 2,
        semiMajorAxis: Math.max(width, height) / 2,
        material: operationColor.withAlpha(0.1),
        outline: true,
        outlineColor: operationColor,
        outlineWidth: 2,
      },
    });
  }

  private getOperationColor(operationType: string): any {
    if (!this.Cesium) return new (this.Cesium || window.Cesium).Color(1, 1, 1, 1);
    
    switch (operationType) {
      case 'strike':
        return this.Cesium.Color.RED;
      case 'patrol':
        return this.Cesium.Color.GREEN;
      case 'intercept':
        return this.Cesium.Color.ORANGE;
      case 'reconnaissance':
        return this.Cesium.Color.CYAN;
      case 'support':
        return this.Cesium.Color.BLUE;
      default:
        return this.Cesium.Color.WHITE;
    }
  }

  removeOperation(operationId: string): void {
    if (!this.viewer) return;
    this.viewer.entities.removeById(`operation-${operationId}`);
  }

  // Collision Alert Visualization
  addCollisionAlert(alert: {
    id: string;
    entityAId: string;
    entityBId: string;
    riskLevel: string;
    missDistanceKm: number;
  }): void {
    if (!this.viewer || !this.Cesium) return;

    const entityA = this.viewer.entities.getById(alert.entityAId);
    const entityB = this.viewer.entities.getById(alert.entityBId);

    if (!entityA?.position || !entityB?.position) return;

    const riskColor = this.getRiskColor(alert.riskLevel);

    this.viewer.entities.add({
      id: `collision-${alert.id}`,
      polyline: {
        positions: new this.Cesium.CallbackProperty(() => {
          const posA = entityA.position!.getValue(this.Cesium!.JulianDate.now());
          const posB = entityB.position!.getValue(this.Cesium!.JulianDate.now());
          if (!posA || !posB) return [];
          return [posA, posB];
        }, false) as any,
        width: 3,
        material: new this.Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.3,
          color: riskColor,
        }),
      },
    });

    this.viewer.entities.add({
      id: `collision-warning-${alert.id}`,
      position: new this.Cesium.CallbackProperty(() => {
        const posA = entityA.position!.getValue(this.Cesium!.JulianDate.now());
        const posB = entityB.position!.getValue(this.Cesium!.JulianDate.now());
        if (!posA || !posB) return this.Cesium!.Cartesian3.ZERO;
        return this.Cesium!.Cartesian3.midpoint(posA, posB, new this.Cesium.Cartesian3());
      }, false) as any,
      point: {
        pixelSize: 15,
        color: riskColor,
        outlineColor: this.Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `ALERT: ${alert.riskLevel.toUpperCase()}`,
        font: '14px monospace',
        fillColor: riskColor,
        outlineColor: this.Cesium.Color.BLACK,
        outlineWidth: 2,
        style: this.Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: this.Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new this.Cesium.Cartesian2(0, -20),
      },
    });
  }

  private getRiskColor(riskLevel: string): any {
    if (!this.Cesium) return this.Cesium!.Color.WHITE;
    
    switch (riskLevel.toLowerCase()) {
      case 'critical':
        return this.Cesium.Color.RED;
      case 'high':
        return this.Cesium.Color.ORANGE;
      case 'medium':
        return this.Cesium.Color.YELLOW;
      case 'low':
        return this.Cesium.Color.GREEN;
      default:
        return this.Cesium.Color.WHITE;
    }
  }

  removeCollisionAlert(alertId: string): void {
    if (!this.viewer) return;
    this.viewer.entities.removeById(`collision-${alertId}`);
    this.viewer.entities.removeById(`collision-warning-${alertId}`);
  }

  // Maneuver Visualization
  addManeuver(maneuver: {
    id: string;
    entityId: string;
    burnTime: string;
    deltaV: { x: number; y: number; z: number };
    burnDurationSec: number;
  }): void {
    if (!this.viewer || !this.Cesium) return;

    const entity = this.viewer.entities.getById(maneuver.entityId);
    if (!entity?.position) return;

    const deltaVMag = Math.sqrt(
      maneuver.deltaV.x ** 2 +
      maneuver.deltaV.y ** 2 +
      maneuver.deltaV.z ** 2
    );

    this.viewer.entities.add({
      id: `maneuver-${maneuver.id}`,
      name: `Maneuver: ${deltaVMag.toFixed(2)} m/s`,
      position: entity.position.getValue(this.Cesium.JulianDate.now()) || this.Cesium.Cartesian3.ZERO,
      point: {
        pixelSize: 12,
        color: this.Cesium.Color.MAGENTA,
        outlineColor: this.Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: `Δv: ${deltaVMag.toFixed(1)} m/s`,
        font: '12px monospace',
        fillColor: this.Cesium.Color.MAGENTA,
        outlineColor: this.Cesium.Color.BLACK,
        outlineWidth: 2,
        style: this.Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: this.Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new this.Cesium.Cartesian2(0, -15),
      },
    });
  }

  // Real-time Position Update
  updateEntityPosition(
    entityId: string,
    position: { longitude: number; latitude: number; altitude: number },
    velocity?: { vx: number; vy: number; vz: number }
  ): void {
    if (!this.viewer || !this.Cesium) return;

    const entity = this.viewer.entities.getById(entityId);
    if (!entity) return;

    entity.position = new this.Cesium.ConstantPositionProperty(
      this.Cesium.Cartesian3.fromDegrees(
        position.longitude,
        position.latitude,
        position.altitude
      )
    );

    if (entity.path) {
      entity.path = new this.Cesium.PathGraphics({
        resolution: 1,
        material: new this.Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: this.Cesium.Color.CYAN,
        }),
        width: 2,
        leadTime: 0,
        trailTime: 300,
      });
    }
  }

  // Animation Controls for Operations
  playOperation(operationId: string): void {
    if (!this.viewer) return;
    this.viewer.clock.shouldAnimate = true;
  }

  pauseOperation(operationId: string): void {
    if (!this.viewer) return;
    this.viewer.clock.shouldAnimate = false;
  }

  setOperationSpeed(multiplier: number): void {
    if (!this.viewer) return;
    this.viewer.clock.multiplier = multiplier;
  }

  seekToTime(time: string): void {
    if (!this.viewer || !this.Cesium) return;
    this.viewer.clock.currentTime = this.Cesium.JulianDate.fromDate(new Date(time));
  }

  // Highlight entities
  highlightEntities(entityIds: string[], color: any = new (window as any).Cesium.Color(1, 1, 0, 1)): void {
    if (!this.viewer) return;

    entityIds.forEach(id => {
      const entity = this.viewer!.entities.getById(id);
      if (entity) {
        if (entity.point) {
          entity.point.outlineColor = new (window as any).Cesium.ConstantProperty(color);
          entity.point.outlineWidth = new (window as any).Cesium.ConstantProperty(3);
        }
      }
    });
  }

  clearHighlights(entityIds: string[]): void {
    if (!this.viewer) return;

    entityIds.forEach(id => {
      const entity = this.viewer!.entities.getById(id);
      if (entity) {
        if (entity.point) {
          entity.point.outlineColor = new (window as any).Cesium.ConstantProperty(new (window as any).Cesium.Color(1, 1, 1, 1));
          entity.point.outlineWidth = new (window as any).Cesium.ConstantProperty(2);
        }
      }
    });
  }
}

export const cesiumController = new CesiumControllerClass();
