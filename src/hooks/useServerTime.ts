import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook that syncs with server time to prevent client clock manipulation.
 * Fetches server time once, calculates offset, then uses local clock + offset.
 */
export function useServerTime() {
  const [offset, setOffset] = useState(0); // ms difference: server - client
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;

    const sync = async () => {
      try {
        const clientBefore = Date.now();
        const { data, error } = await supabase.functions.invoke('server-time');
        const clientAfter = Date.now();

        if (error || !data?.now) return;

        const serverTime = new Date(data.now).getTime();
        const roundTrip = clientAfter - clientBefore;
        const estimatedServerNow = serverTime + roundTrip / 2;
        setOffset(estimatedServerNow - clientAfter);
      } catch {
        // fallback to local clock (offset = 0)
      }
    };

    sync();
  }, []);

  /** Returns the current server-synced timestamp in ms */
  const now = () => Date.now() + offset;

  return { now, offset };
}
