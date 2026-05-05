import { ApiClient } from '@/lib/api';
import type { EntityIntelBrief, EntitySpecEntry, EntityLink, EntityTimelineEntry } from '@/lib/store/entityIntel';

const client = new ApiClient();

export const entityIntelApi = {
  async getBrief(entityType: string, entityId: string): Promise<EntityIntelBrief> {
    const data = await client.get<{
      summary: string;
      threat_level: string;
      capabilities: string[];
      mission_profile: string | null;
      command_control: string | null;
      confidence: number;
    }>(`/entity-intel/${entityType}/${entityId}/brief`);
    return {
      summary: data.summary,
      threatLevel: data.threat_level as EntityIntelBrief['threatLevel'],
      capabilities: data.capabilities,
      missionProfile: data.mission_profile,
      commandControl: data.command_control,
      confidence: data.confidence,
    };
  },

  async getSpecs(entityType: string, entityId: string): Promise<EntitySpecEntry[]> {
    const data = await client.get<{ key: string; value: string; unit?: string }[]>(
      `/entity-intel/${entityType}/${entityId}/specs`,
    );
    return data;
  },

  async getLinks(entityType: string, entityId: string): Promise<EntityLink[]> {
    const data = await client.get<
      {
        related_entity_id: string;
        related_entity_name: string;
        related_entity_type: string;
        relationship: string;
      }[]
    >(`/entity-intel/${entityType}/${entityId}/links`);
    return data.map((d) => ({
      relatedEntityId: d.related_entity_id,
      relatedEntityName: d.related_entity_name,
      relatedEntityType: d.related_entity_type,
      relationship: d.relationship,
    }));
  },

  async getTimeline(entityType: string, entityId: string): Promise<EntityTimelineEntry[]> {
    return client.get<EntityTimelineEntry[]>(
      `/entity-intel/${entityType}/${entityId}/timeline`,
    );
  },
};
