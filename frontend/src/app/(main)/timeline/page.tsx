'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, Elevation, Icon, Button, Tag, HTMLSelect, Spinner } from '@blueprintjs/core';
import { format, addDays } from 'date-fns';
import { api } from '@/lib/api';

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
  const [loading, setLoading] = useState(false);

  const loadEvents = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const eventTypes = selectedType === 'all' ? undefined : selectedType;
      const response = await api.getTimelineEvents({ date: dateStr, event_types: eventTypes });
      
      const loadedEvents: TimelineEvent[] = response.events.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        time: new Date(e.time),
        severity: e.severity,
        details: e.details,
      }));
      
      setEvents(loadedEvents);
    } catch (error) {
      console.warn('Failed to load timeline events:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  useEffect(() => {
    const today = new Date();
    setSelectedDate(today);
    loadEvents(today);
    setMounted(true);
  }, [loadEvents]);

  const handlePrevDay = () => {
    if (selectedDate) {
      const newDate = addDays(selectedDate, -1);
      setSelectedDate(newDate);
      loadEvents(newDate);
    }
  };

  const handleNextDay = () => {
    if (selectedDate) {
      const newDate = addDays(selectedDate, 1);
      setSelectedDate(newDate);
      loadEvents(newDate);
    }
  };

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
    <div className="h-full flex flex-col p-4">
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
          <Button icon="chevron-left" minimal onClick={handlePrevDay} />
          <Button minimal>{selectedDate ? format(selectedDate, 'MMM d, yyyy') : 'Select date'}</Button>
          <Button icon="chevron-right" minimal onClick={handleNextDay} />
        </div>
      </div>

      <Card elevation={Elevation.TWO} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 p-2 text-sda-accent-cyan border-b border-sda-border">
          <Icon icon="time" />
          <span className="text-sm">Now: {mounted ? format(new Date(), 'PPpp') : 'Loading...'}</span>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-sda-text-secondary">
              <Icon icon="timeline-events" size={48} className="mb-2 opacity-50" />
              <p>No events for this date</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 bg-sda-bg-secondary rounded-lg border border-sda-border"
                >
                  <Icon
                    icon={eventIcon(event.type) as any}
                    className={`mt-1 ${eventColor(event.type)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-sda-text-primary truncate">{event.title}</h3>
                      {event.severity && (
                        <Tag
                          minimal
                          intent={
                            event.severity === 'critical'
                              ? 'danger'
                              : event.severity === 'warning'
                              ? 'warning'
                              : 'none'
                          }
                        >
                          {event.severity}
                        </Tag>
                      )}
                    </div>
                    <p className="text-sm text-sda-text-secondary">
                      {format(event.time, 'HH:mm:ss')}
                    </p>
                    {event.details && (
                      <p className="text-sm text-sda-text-secondary mt-1">{event.details}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

