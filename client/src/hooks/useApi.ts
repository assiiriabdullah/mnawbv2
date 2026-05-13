import { useState, useCallback } from 'react';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export function useApi() {
  const [loading, setLoading] = useState(false);

  const call = useCallback(async <T = any>(url: string, method: Method = 'GET', body?: any): Promise<T> => {
    setLoading(true);
    try {
      const opts: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body && method !== 'GET') opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      return data as T;
    } finally {
      setLoading(false);
    }
  }, []);

  return { call, loading };
}

// Simple fetch without loading state (for background calls)
export async function api<T = any>(url: string, method: Method = 'GET', body?: any): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'حدث خطأ');
  return data as T;
}
