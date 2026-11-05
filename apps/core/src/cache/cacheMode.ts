import type { CacheMode } from '@tipeline/schemas';

/** A run request's `cache` option ('bypass' | 'refresh'); anything else means use the cache. */
export const toCacheMode = (value: unknown): CacheMode =>
  value === 'bypass' || value === 'refresh' ? value : 'use';
