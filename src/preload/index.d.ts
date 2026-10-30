import type { GlibraryApi } from './index';

declare global {
  interface Window {
    api: GlibraryApi;
  }
}

export {};
