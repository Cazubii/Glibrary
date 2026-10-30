import type { GlibraryApi } from '@shared/types';

declare global {
  interface Window {
    api: GlibraryApi;
  }
}

export {};
