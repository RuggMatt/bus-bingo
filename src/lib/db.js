// db.js
// IndexedDB storage. This is the source of truth on the device: it works
// offline and when signed out, and sync.js reconciles it with Supabase.
//
// Stores (v2):
//   routes    [agency_id, route_number] -> { agency_id, route_number, description }
//   sightings [agency_id, route_number] -> { agency_id, route_number, seen, seen_at, updated_at, dirty }
//   meta      key -> { key, value }
//
// v1 had a single `buses` store mixing routes and seen state; it is migrated
// into `routes` + `sightings` (as Edmonton/ETS data) on upgrade.

import { DEFAULT_AGENCY_ID } from './agencies.js';

const DB_NAME = 'busBingoDB';
const DB_VERSION = 2;

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/** @returns {Promise<IDBDatabase>} */
function openDB() {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = (event) => {
			const db = request.result;
			const tx = /** @type {IDBTransaction} */ (request.transaction);

			const routes = db.objectStoreNames.contains('routes')
				? tx.objectStore('routes')
				: db.createObjectStore('routes', { keyPath: ['agency_id', 'route_number'] });
			if (!routes.indexNames.contains('agency_id')) routes.createIndex('agency_id', 'agency_id');

			const sightings = db.objectStoreNames.contains('sightings')
				? tx.objectStore('sightings')
				: db.createObjectStore('sightings', { keyPath: ['agency_id', 'route_number'] });
			if (!sightings.indexNames.contains('agency_id'))
				sightings.createIndex('agency_id', 'agency_id');

			if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });

			if (event.oldVersion === 1 && db.objectStoreNames.contains('buses')) {
				const legacy = tx.objectStore('buses').getAll();
				legacy.onsuccess = () => {
					for (const bus of legacy.result) {
						const key = { agency_id: DEFAULT_AGENCY_ID, route_number: String(bus.route_number) };
						routes.put({ ...key, description: bus.description || '' });
						if (bus.seen) {
							const at = bus.seen_at || new Date().toISOString();
							sightings.put({ ...key, seen: true, seen_at: at, updated_at: at, dirty: 1 });
						}
					}
					db.deleteObjectStore('buses');
				};
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => {
			dbPromise = null;
			reject(request.error);
		};
	});
	return dbPromise;
}

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function promisify(req) {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/** @param {IDBTransaction} tx */
function done(tx) {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve(undefined);
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}

/** @param {string} agency_id */
export async function getRoutes(agency_id) {
	const db = await openDB();
	const tx = db.transaction('routes', 'readonly');
	return promisify(tx.objectStore('routes').index('agency_id').getAll(agency_id));
}

/**
 * Replace the stored route list for an agency. Sightings are kept even if a
 * route disappears, so a temporarily missing route doesn't lose progress.
 * @param {string} agency_id
 * @param {{ route_number: string, description: string }[]} routes
 */
export async function replaceRoutes(agency_id, routes) {
	const db = await openDB();
	const tx = db.transaction('routes', 'readwrite');
	const store = tx.objectStore('routes');
	const keys = await promisify(store.index('agency_id').getAllKeys(agency_id));
	const next = new Set(routes.map((r) => r.route_number));
	for (const key of keys) {
		if (!next.has(/** @type {any} */ (key)[1])) store.delete(key);
	}
	for (const r of routes) store.put({ agency_id, ...r });
	await done(tx);
}

/** @param {string} [agency_id] all agencies when omitted */
export async function getSightings(agency_id) {
	const db = await openDB();
	const store = db.transaction('sightings', 'readonly').objectStore('sightings');
	return promisify(agency_id ? store.index('agency_id').getAll(agency_id) : store.getAll());
}

/**
 * Record a local change. Marked dirty until it has been pushed to Supabase.
 * @param {string} agency_id
 * @param {string} route_number
 * @param {boolean} seen
 */
export async function setSighting(agency_id, route_number, seen) {
	const db = await openDB();
	const tx = db.transaction('sightings', 'readwrite');
	const now = new Date().toISOString();
	tx.objectStore('sightings').put({
		agency_id,
		route_number,
		seen,
		seen_at: seen ? now : null,
		updated_at: now,
		dirty: 1
	});
	await done(tx);
}

/**
 * Apply the result of a sync. Each record is only written if the local copy
 * hasn't changed since sync read it (compared by updated_at), so taps made
 * while a sync is in flight are never overwritten.
 * @param {{ record: any, expectedUpdatedAt: string | null }[]} writes
 */
export async function applySynced(writes) {
	const db = await openDB();
	const tx = db.transaction('sightings', 'readwrite');
	const store = tx.objectStore('sightings');
	for (const { record, expectedUpdatedAt } of writes) {
		const req = store.get([record.agency_id, record.route_number]);
		req.onsuccess = () => {
			const current = req.result;
			if ((current?.updated_at ?? null) === expectedUpdatedAt) store.put(record);
		};
	}
	await done(tx);
}

export async function clearSightings() {
	const db = await openDB();
	const tx = db.transaction('sightings', 'readwrite');
	tx.objectStore('sightings').clear();
	await done(tx);
}

/** @param {string} key */
export async function getMeta(key) {
	const db = await openDB();
	const row = await promisify(db.transaction('meta', 'readonly').objectStore('meta').get(key));
	return row?.value;
}

/**
 * @param {string} key
 * @param {any} value
 */
export async function setMeta(key, value) {
	const db = await openDB();
	const tx = db.transaction('meta', 'readwrite');
	tx.objectStore('meta').put({ key, value });
	await done(tx);
}
