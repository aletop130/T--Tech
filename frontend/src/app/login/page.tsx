'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push('/map');
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || 'Authentication failed');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black">
      {/* Background image — same as dashboard */}
      <img
        src="/bg-satellite.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ opacity: 0.4, filter: 'brightness(0.7)' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/70" />

      {/* Login card */}
      <div
        className={`relative z-10 w-full max-w-sm px-4 transition-all duration-500 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
        }`}
      >
        <div className="border border-[#2a2a2a] bg-[#0a0a0a] p-8">
          {/* Logo — white, no glow */}
          <div className="flex flex-col items-center mb-8">
            <img
              src="/omniscient-logo.svg"
              alt="Horus"
              className="h-14 w-14 mb-4"
            />
            <h1 className="text-xl font-semibold tracking-widest text-white uppercase">
              Horus
            </h1>
            <p className="text-[11px] font-medium tracking-[0.2em] uppercase text-[#a0a0a0] mt-1">
              Space Domain Awareness
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error */}
            {error && (
              <div className="border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Username */}
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-[#a0a0a0] text-xs uppercase tracking-wider">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                required
                className="h-10 rounded-none border-[#2a2a2a] bg-[#141414] text-white placeholder:text-[#555] focus-visible:ring-[#2f81f7] focus-visible:border-[#2f81f7]"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#a0a0a0] text-xs uppercase tracking-wider">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
                className="h-10 rounded-none border-[#2a2a2a] bg-[#141414] text-white placeholder:text-[#555] focus-visible:ring-[#2f81f7] focus-visible:border-[#2f81f7]"
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="h-10 w-full rounded-none bg-[#2f81f7] hover:bg-[#2f81f7]/90 text-white font-medium tracking-wide transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Authenticating...
                </span>
              ) : (
                'Sign In'
              )}
            </Button>

            <div className="pt-2 text-center">
              <p className="text-[11px] text-[#555]">
                Authorized personnel only. All access is monitored.
              </p>
            </div>
          </form>
        </div>

        <div className="mt-4 text-center">
          <p className="text-[11px] text-[#444]">
            T-Tech &middot; Powered by Telespazio
          </p>
        </div>
      </div>
    </div>
  );
}
