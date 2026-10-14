// busStore.js
// App state. Everything reads and writes IndexedDB first (so it works offline
// and signed out); when signed in, changes are synced to Supabase in the
// background.
import { derived, get, writable } from 'svelte/store';
import { base } from '$app/paths';
import { AGENCIES, DEFAULT_AGENCY_ID } from './agencies.js';
import {
	clearSightings,
	getRoutes,
	getSightings,
	replaceRoutes,
	setMeta,
	setSighting
} from './db.js';
import { supabase } from './supabase.js';
import { syncSightings } from './sync.js';

export const authEnabled = !!supabase;

export const agencyId = writable(DEFAULT_AGENCY_ID);
export const loading = writable(true);
/** @type {import('svelte/store').Writable<string | null>} */
export const routesError = writable(null);

/** @type {import('svelte/store').Writable<import('@supabase/supabase-js').User | null>} */
export const user = writable(null);
/** @type {import('svelte/store').Writable<'idle' | 'syncing' | 'synced' | 'offline' | 'error'>} */
export const syncState = writable('idle');

/** @type {import('svelte/store').Writable<any[]>} */
const routes = writable([]);
/** @type {import('svelte/store').Writable<any[]>} */
const sightings = writable([]);

export const buses = derived([routes, sightings], ([$routes, $sightings]) => {
	const seen = new Map($sightings.map((s) => [s.route_number, s]));
	return $routes.map((r) => ({
		route_number: r.route_number,
		description: r.description,
		seen: !!seen.get(r.route_number)?.seen,
		seen_at: seen.get(r.route_number)?.seen_at ?? null
	}));
});

async function refreshLocal() {
	const id = get(agencyId);
	const [r, s] = await Promise.all([getRoutes(id), getSightings(id)]);
	routes.set(r);
	sightings.set(s);
}

/** Show cached routes immediately, then refresh the list from the agency. */
export async function loadBuses() {
	const agency = AGENCIES[get(agencyId)];
	await refreshLocal();
	if (get(routes).length) loading.set(false);
	try {
		const response = await fetch(agency.routesUrl);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const fresh = agency.parseRoutes(await response.json());
		if (fresh.length) {
			await replaceRoutes(agency.id, fresh);
			await refreshLocal();
		}
		routesError.set(null);
	} catch (e) {
		console.warn('Could not refresh routes', e);
		if (!get(routes).length) routesError.set('Could not load bus routes. Are you offline?');
	} finally {
		loading.set(false);
	}
}

/** @param {{ route_number: string, seen: boolean }} bus */
export async function toggleSeen(bus) {
	await setSighting(get(agencyId), bus.route_number, !bus.seen);
	await refreshLocal();
	scheduleSync();
}

// --- Sync ---------------------------------------------------------------

/** @type {Promise<void> | null} */
let syncing = null;
let syncAgain = false;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let syncTimer;

/** Sync now; concurrent calls coalesce into one follow-up run. */
export function requestSync() {
	if (!get(user)) return Promise.resolve();
	if (syncing) {
		syncAgain = true;
		return syncing;
	}
	syncing = (async () => {
		do {
			syncAgain = false;
			const current = get(user);
			if (!current) break;
			syncState.set('syncing');
			try {
				await syncSightings(current.id);
				syncState.set('synced');
			} catch (e) {
				console.warn('Sync failed', e);
				syncState.set(navigator.onLine ? 'error' : 'offline');
				syncAgain = false;
			}
		} while (syncAgain);
		await refreshLocal();
		syncing = null;
	})();
	return syncing;
}

function scheduleSync() {
	clearTimeout(syncTimer);
	syncTimer = setTimeout(requestSync, 1000);
}

// --- Auth ---------------------------------------------------------------

let authStarted = false;

export function initAuth() {
	if (!supabase || authStarted) return;
	authStarted = true;
	supabase.auth.onAuthStateChange((event, session) => {
		user.set(session?.user ?? null);
		if (!session?.user) syncState.set('idle');
		// Don't await Supabase calls inside this callback (it can deadlock).
		if (session?.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
			setTimeout(requestSync, 0);
		}
	});
	window.addEventListener('online', () => requestSync());
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') requestSync();
	});
}

/** Email a one-time code (and magic link) to sign in or sign up. @param {string} email */
export async function sendSignInEmail(email) {
	if (!supabase) throw new Error('Sign-in is not configured');
	const { error } = await supabase.auth.signInWithOtp({
		email,
		options: { emailRedirectTo: `${location.origin}${base}/` }
	});
	if (error) throw error;
}

/**
 * Verify the code from the email. Needed for the installed PWA on iOS, where a
 * tapped magic link opens Safari instead of the app.
 * @param {string} email
 * @param {string} token
 */
export async function verifySignInCode(email, token) {
	if (!supabase) throw new Error('Sign-in is not configured');
	const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
	if (error) throw error;
}

/** @returns {Promise<boolean>} true if some local changes have not reached the server */
export async function hasUnsyncedChanges() {
	await requestSync();
	return (await getSightings()).some((s) => s.dirty);
}

/**
 * Sign out and clear this device's copy of the user's progress (it lives in
 * Supabase), leaving a fresh card for signed-out play.
 */
export async function signOut() {
	if (!supabase) return;
	clearTimeout(syncTimer);
	await supabase.auth.signOut({ scope: 'local' });
	await clearSightings();
	await setMeta('owner', null);
	await refreshLocal();
}
