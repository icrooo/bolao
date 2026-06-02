import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that syncs with server time to prevent client clock manipulation.
 * Fetches server time once (with retries), calculates offset, then uses local clock + offset.
 */
export function useServerTime() {
  const [offset, setOffset] = useState(0); // ms difference: server - client
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;

    let cancelled = false;
    const MAX_ATTEMPTS = 4;
    const BASE_DELAY = 800; // ms

    const attemptSync = async (attempt: number): Promise<boolean> => {
      try {
        const clientBefore = Date.now();
        const { data, error } = await supabase.functions.invoke('server-time');
        const clientAfter = Date.now();

        if (error || !data?.now) return false;

        const serverTime = new Date(data.now).getTime();
        const roundTrip = clientAfter - clientBefore;
        const estimatedServerNow = serverTime + roundTrip / 2;
        if (!cancelled) setOffset(estimatedServerNow - clientAfter);
        return true;
      } catch {
        return false;
      }
    };

    const run = async () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled) return;
        const ok = await attemptSync(i);
        if (ok) return;
        // exponential backoff with jitter
        const delay = BASE_DELAY * Math.pow(2, i) + Math.random() * 200;
        await new Promise(r => setTimeout(r, delay));
      }
      // all attempts failed -> fallback to local clock (offset = 0)
    };

    run();

    return () => { cancelled = true; };
  }, []);

  /** Returns the current server-synced timestamp in ms */
  const now = () => Date.now() + offset;

  return { now, offset };
}
