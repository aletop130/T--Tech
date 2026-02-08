'use client';

import { useEffect, useState } from 'react';
import { Card, Elevation, Icon, Button, Tag, HTMLSelect } from '@blueprintjs/core';
import { format, addDays, startOfDay } from 'date-fns';

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  time: Date;
  severity?: string;
  details?: string;
}

export default function TimelinePage() {
  const [mounted, setMounted] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');

  useEffect(() => {
    // Demo events - in production, fetch from API
    const demoEvents: TimelineEvent[] = [
      {
        id: '1',
        type: 'conjunction',
        title: 'Close approach: ISS / Debris',
        time: new Date(),
        severity: 'high',
        details: 'Miss distance: 0.5 km',
      },
      {
        id: '2',
        type: 'space_weather',
        title: 'Geomagnetic storm warning',
        time: addDays(new Date(), -0.5),
        severity: 'moderate',
        details: 'Kp index: 5',
      },
      {
        id: '3',
        type: 'incident',
        title: 'RF interference detected',
        time: addDays(new Date(), -1),
        severity: 'medium',
      },
      {
        id: '4',
        type: 'ingestion',
        title: 'TLE update completed',
        time: addDays(new Date(), -1.5),
        details: '500 objects updated',
      },
      {
        id: '5',
        type: 'conjunction',
        title: 'Predicted conjunction: SAT-A / SAT-B',
        time: addDays(new Date(), 1),
        severity: 'medium',
        details: 'TCA in 24 hours',
      },
    ];
    setEvents(demoEvents);
    setSelectedDate(new Date());
    setMounted(true);
  }, []);

  const eventIcon = (type: string) => {
    const icons: Record<string, string> = {
      conjunction: 'intersection',
      space_weather: 'flash',
      incident: 'warning-sign',
      ingestion: 'import',
    };
    return icons[type] || 'dot';
  };

  const eventColor = (type: string) => {
    const colors: Record<string, string> = {
      conjunction: 'text-sda-accent-yellow',
      space_weather: 'text-sda-accent-orange',
      incident: 'text-sda-accent-red',
      ingestion: 'text-sda-accent-blue',
    };
    return colors[type] || 'text-sda-text-secondary';
  };

  const filteredEvents = events.filter(
    (e) => selectedType === 'all' || e.type === selectedType
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="timeline-events" className="text-sda-accent-cyan" />
          Event Timeline
        </h1>
        <div className="flex gap-2">
          <HTMLSelect
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="all">All Events</option>
            <option value="conjunction">Conjunctions</option>
            <option value="space_weather">Space Weather</option>
            <option value="incident">Incidents</option>
            <option value="ingestion">Ingestion</option>
          </HTMLSelect>
          <Button icon="chevron-left" minimal />
          <Button minimal>{selectedDate ? format(selectedDate, 'MMM d, yyyy') : 'Select date'}</Button>
          <Button icon="chevron-right" minimal />
        </div>
      </div>

      {/* Timeline */}
      <Card elevation={Elevation.TWO} className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto p-4">
          {/* Time scale */}
          <div className="flex border-b border-sda-border-default pb-2 mb-4">
            {Array.from({ length: 24 }, (_, i) => (
              <div key={i} className="flex-1 text-xs text-sda-text-muted text-center">
                {i.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Events */}
          <div className="relative">
            {filteredEvents.map((event, index) => {
              const hourPosition = event.time.getHours() + event.time.getMinutes() / 60;
              const leftPercent = (hourPosition / 24) * 100;

              return (
                <div
                  key={event.id}
                  className="relative mb-8"
                >
                  <div
                    className="absolute w-4 h-4 rounded-full bg-sda-bg-tertiary border-2 border-sda-accent-cyan z-10"
                    style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
                  />
                  <div
                    className="absolute mt-6 w-64 p-3 bg-sda-bg-tertiary rounded-lg"
                    style={{ 
                      left: `${Math.min(leftPercent, 75)}%`,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        icon={eventIcon(event.type) as any}
                        className={eventColor(event.type)}
                        size={14}
                      />
                      <span className="text-xs text-sda-text-muted">
                        {format(event.time, 'HH:mm')}
                      </span>
                      {event.severity && (
                        <Tag minimal className="capitalize">
                          {event.severity}
                        </Tag>
                      )}
                    </div>
                    <div className="font-medium text-sm">{event.title}</div>
                    {event.details && (
                      <div className="text-xs text-sda-text-secondary mt-1">
                        {event.details}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Now indicator */}
      <div className="flex items-center gap-2 mt-4 text-sda-accent-cyan">
        <Icon icon="time" />
        <span className="text-sm">Now: {mounted ? format(new Date(), 'PPpp') : 'Loading...'}</span>
      </div>
    </div>
  );
}

