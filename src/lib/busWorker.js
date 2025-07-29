// busWorker.js
// Web Worker for fetching bus data and managing IndexedDB

const DB_NAME = 'busBingoDB';
const STORE_NAME = 'buses';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      // event.target is an IDBOpenDBRequest; ignore linter type error for plain JS
      // eslint-disable-next-line
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'route_number' });
        store.createIndex('seen', 'seen', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function fetchAndStoreBuses() {
  const response = await fetch('https://data.edmonton.ca/resource/d577-xky7.json');
  const buses = await response.json();
  const db = await openDB();
  // Get all existing buses from the DB
  const existingTx = db.transaction(STORE_NAME, 'readonly');
  const existingStore = existingTx.objectStore(STORE_NAME);
  const existingReq = existingStore.getAll();
  const existingBuses = await new Promise((resolve, reject) => {
    existingReq.onsuccess = () => resolve(existingReq.result);
    existingReq.onerror = () => reject(existingReq.error);
  });

  // Build sets for comparison
  const newBusNumbers = new Set(buses.map(bus => bus.route_id));
  const existingBusNumbers = new Set(existingBuses.map(bus => bus.route_number));

  // Remove buses not in the new list
  const removeTx = db.transaction(STORE_NAME, 'readwrite');
  const removeStore = removeTx.objectStore(STORE_NAME);
  existingBuses.forEach(bus => {
    if (!newBusNumbers.has(bus.route_number)) {
      removeStore.delete(bus.route_number);
    }
  });

  // Add or update buses from the new list
  const addTx = db.transaction(STORE_NAME, 'readwrite');
  const addStore = addTx.objectStore(STORE_NAME);
  buses.forEach(bus => {
    const route_number = bus.route_id;
    const description = bus.route_long_name || bus.route_short_name || '';
    const existing = existingBuses.find(b => b.route_number === route_number);
    if (!existing) {
      // New bus, add it
      addStore.put({
        route_number,
        description,
        seen: false,
        seen_at: null
      });
    } else {
      // Existing bus, update description if changed
      if (existing.description !== description) {
        existing.description = description;
        addStore.put(existing);
      }
    }
  });

  // Wait for both transactions to complete
  return Promise.all([
    new Promise((resolve, reject) => {
      removeTx.oncomplete = () => resolve();
      removeTx.onerror = () => reject(removeTx.error);
    }),
    new Promise((resolve, reject) => {
      addTx.oncomplete = () => resolve();
      addTx.onerror = () => reject(addTx.error);
    })
  ]);
}

async function getAllBuses() {
  const db = await openDB();
  // eslint-disable-next-line no-undef
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {number} route_number
 * @param {boolean} seen
 * @returns {Promise<void>}
 */
async function setBusSeen(route_number, seen) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const req = store.get(route_number);
  req.onsuccess = () => {
    const bus = req.result;
    bus.seen = seen;
    bus.seen_at = seen ? new Date().toISOString() : null;
    store.put(bus);
  };
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;
  if (type === 'fetchAndStore') {
    await fetchAndStoreBuses();
    self.postMessage({ type: 'ready' });
  } else if (type === 'getAll') {
    const buses = await getAllBuses();
    self.postMessage({ type: 'buses', payload: buses });
  } else if (type === 'setSeen') {
    await setBusSeen(payload.route_number, payload.seen);
    self.postMessage({ type: 'marked', payload: payload.route_number });
  }
};
