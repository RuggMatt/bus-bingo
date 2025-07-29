// busStore.js
import { writable } from 'svelte/store';

// Use relative path for worker in SvelteKit
const busWorker = new Worker(new URL('./busWorker.js', import.meta.url));

export const buses = writable([]);
export const ready = writable(false);

// eslint-disable-next-line
busWorker.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === 'ready') {
    busWorker.postMessage({ type: 'getAll' });
    ready.set(true);
  } else if (type === 'buses') {
    buses.set(payload);
  } else if (type === 'marked') {
    // Refresh bus list after marking
    busWorker.postMessage({ type: 'getAll' });
  }
};

export function fetchBuses() {
  busWorker.postMessage({ type: 'fetchAndStore' });
}

// eslint-disable-next-line
export function markBusSeen(route_number, seen = true) {
  busWorker.postMessage({ type: 'setSeen', payload: { route_number, seen } });
}

