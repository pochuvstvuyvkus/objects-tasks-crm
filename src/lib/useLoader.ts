import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './errors';

type LoaderState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
};

/** Загрузка данных с состояниями loading/error и ручной перезагрузкой. */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]): LoaderState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await run();
      if (id === requestId.current) setData(result);
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
