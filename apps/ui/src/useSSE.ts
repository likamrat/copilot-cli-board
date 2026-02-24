import { useEffect, useRef } from 'react';

export function useSSE(onEvent: (type: string, data: unknown) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let es: EventSource;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/stream');

      es.onopen = () => {
        console.log('[SSE] connected');
      };

      es.onerror = (e) => {
        console.error('[SSE] error, readyState:', es.readyState, e);
        es.close();
        reconnectTimer = setTimeout(connect, 2000);
      };

      // Also listen for generic 'message' events as fallback
      es.onmessage = (e) => {
        console.log('[SSE] generic message:', e);
      };

      const types = [
        'card:created', 'card:updated', 'card:moved',
        'card:archived', 'card:unarchived', 'card:labels',
        'card:provenance', 'label:created', 'label:updated', 'event:created',
        'stats:updated',
      ];

      for (const type of types) {
        es.addEventListener(type, (e) => {
          try {
            const data = JSON.parse(e.data);
            onEventRef.current(type, data);
          } catch { /* ignore parse errors */ }
        });
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);
}
