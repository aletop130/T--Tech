'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button, NumericInput, Intent, Spinner } from '@blueprintjs/core';
import { api } from '@/lib/api';

interface DebrisAddMenuProps {
  onDebrisAdded?: (count: number) => void;
  debrisCount?: number;
}

export const DebrisAddMenu: React.FC<DebrisAddMenuProps> = ({
  onDebrisAdded,
  debrisCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(100);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleAddDebris = async () => {
    if (count < 1 || count > 10000) {
      setMessage('Inserisci un numero tra 1 e 10000');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await api.generateDebris(count);
      setMessage(`Creati ${result.created} debris!`);
      onDebrisAdded?.(result.created);
      window.dispatchEvent(new CustomEvent('refreshDebris'));
      setTimeout(() => {
        setIsOpen(false);
        setMessage(null);
      }, 1500);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Errore durante la generazione');
    } finally {
      setLoading(false);
    }
  };

  const quickOptions = [10, 100, 500, 1000];

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        minimal
        intent={Intent.WARNING}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 whitespace-nowrap"
      >
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }}></span>
        <span>Debris: {debrisCount ?? 0}</span>
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </Button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-2 w-72 bg-sda-bg-secondary border border-sda-border-default rounded-lg shadow-xl z-50 p-4"
        >
          <div className="text-sm font-semibold text-sda-text-primary mb-3">
            Aggiungi Debris
          </div>

          <div className="mb-3">
            <label className="text-xs text-sda-text-secondary mb-1 block">
              Numero di debris:
            </label>
            <NumericInput
              fill
              min={1}
              max={10000}
              value={count}
              onValueChange={(val) => setCount(val)}
              className="w-full"
            />
          </div>

          <div className="flex gap-2 mb-4">
            {quickOptions.map((opt) => (
              <Button
                key={opt}
                minimal
                small
                intent={count === opt ? Intent.WARNING : Intent.NONE}
                onClick={() => setCount(opt)}
                className="text-xs"
              >
                {opt}
              </Button>
            ))}
          </div>

          <Button
            fill
            intent={Intent.WARNING}
            onClick={handleAddDebris}
            disabled={loading}
          >
            {loading ? <Spinner size={16} /> : 'Aggiungi'}
          </Button>

          {message && (
            <div className={`mt-2 text-xs ${message.includes('Creati') ? 'text-green-400' : 'text-red-400'}`}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
