import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';

interface GroundUnit {
  id: string;
  name: string;
  sidc: string;
  position: Cesium.Cartesian3;
  affiliation: 'friendly' | 'hostile' | 'neutral';
  status: 'static' | 'moving';
  heading?: number;
  speed?: number;
}

interface MilitarySymbolLayerProps {
  viewer: Cesium.Viewer | null;
  units: GroundUnit[];
}

export const SAR_SYMBOLS = {
  FRIENDLY_TEAM: 'SFGPUCVF--*****',
  FRIENDLY_HELO: 'SFAPMH----*****',
  FRIENDLY_SHIP: 'SFAPW-----*****',
  HOSTILE_PATROL: 'SHGPU-----*****',
  HOSTILE_BASE: 'SHGPI-----*****',
  EXTRACTION_POINT: 'GFGPGLP---*****',
  SAFE_CORRIDOR: 'GFGPALC---*****',
};

function createMilitarySymbol(affiliation: string, unitType: string): Cesium.Color[] {
  const colors: { [key: string]: Cesium.Color } = {
    friendly: Cesium.Color.CYAN,
    hostile: Cesium.Color.GRAY,
    neutral: Cesium.Color.YELLOW,
  };
  
  return [
    colors[affiliation] || Cesium.Color.WHITE,
    Cesium.Color.BLACK,
  ];
}

export function MilitarySymbolLayer({ viewer, units }: MilitarySymbolLayerProps) {
  const entitiesRef = useRef<Set<string>>(new Set());
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!viewer) return;

    const createdEntities: string[] = [];

    units.forEach((unit) => {
      const entityId = `military-unit-${unit.id}`;
      
      const existing = viewer.entities.getById(entityId);
      if (existing) {
        viewer.entities.remove(existing);
      }

      const baseColor = unit.affiliation === 'friendly' 
        ? Cesium.Color.CYAN 
        : unit.affiliation === 'hostile' 
          ? Cesium.Color.RED 
          : Cesium.Color.YELLOW;

      const symbolEntity = viewer.entities.add({
        id: entityId,
        position: unit.position,
        ellipse: {
          semiMajorAxis: 1500,
          semiMinorAxis: 1500,
          material: baseColor.withAlpha(0.3),
          outline: true,
          outlineColor: baseColor,
          outlineWidth: 3,
        },
        point: {
          pixelSize: 20,
          color: baseColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: unit.name,
          font: 'bold 14px monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -25),
          show: true,
        },
      });
      createdEntities.push(entityId);

      if (unit.status === 'moving' && unit.heading !== undefined) {
        const arrowId = `military-unit-${unit.id}-arrow`;
        const headingRad = Cesium.Math.toRadians(unit.heading);
        const arrowLength = 5000;
        
        const startCartographic = Cesium.Cartographic.fromCartesian(unit.position);
        const endCartographic = new Cesium.Cartographic(
          startCartographic.longitude + (Math.sin(headingRad) * arrowLength / 111320),
          startCartographic.latitude + (Math.cos(headingRad) * arrowLength / 110540),
          startCartographic.height
        );
        
        const endPosition = Cesium.Cartesian3.fromRadians(
          endCartographic.longitude,
          endCartographic.latitude,
          endCartographic.height
        );

        viewer.entities.add({
          id: arrowId,
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const pos = unit.position;
              const head = unit.heading || 0;
              const rad = Cesium.Math.toRadians(head);
              const len = 5000;
              const sc = Cesium.Cartographic.fromCartesian(pos);
              const endSc = new Cesium.Cartographic(
                sc.longitude + (Math.sin(rad) * len / 111320),
                sc.latitude + (Math.cos(rad) * len / 110540),
                sc.height
              );
              return [pos, Cesium.Cartesian3.fromRadians(endSc.longitude, endSc.latitude, endSc.height)];
            }, false) as unknown as Cesium.PositionProperty,
            width: 6,
            material: new Cesium.PolylineArrowMaterialProperty(baseColor),
          },
        });
        createdEntities.push(arrowId);
      }

      const statusId = `military-unit-${unit.id}-status`;
      viewer.entities.add({
        id: statusId,
        position: new Cesium.CallbackProperty(() => {
          const pos = unit.position;
          return new Cesium.Cartesian3(pos.x + 1000, pos.y + 1000, pos.z);
        }, false) as unknown as Cesium.PositionProperty,
        point: {
          pixelSize: 8,
          color: unit.affiliation === 'friendly' 
            ? Cesium.Color.LIME 
            : unit.affiliation === 'hostile' 
              ? Cesium.Color.RED 
              : Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
      });
      createdEntities.push(statusId);
    });

    entitiesRef.current = new Set(createdEntities);

    cleanupRef.current = () => {
      createdEntities.forEach((id) => {
        const entity = viewer.entities.getById(id);
        if (entity) {
          viewer.entities.remove(entity);
        }
      });
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [viewer, units]);

  return null;
}
