// sync.js
// Two-way sync of sightings between IndexedDB and the Supabase `seen_buses`
// table, last-write-wins on updated_at. Un-seeing a bus is stored as
// seen = false (not a delete) so it syncs like any other change.
//
// The `owner` meta key records which user the local data belongs to:
//   undefined/null -> anonymous progress; on first sign-in it is migrated up
//   same user      -> normal sync
//   other user     -> local copy belongs to someone else; discard and pull
import { supabase } from './supabase.js';
import { applySynced, clearSightings, getMeta, getSightings, setMeta } from './db.js';

const TABLE = 'seen_buses';

/** @param {{ agency_id: string, route_number: string }} r */
const keyOf = (r) => `${r.agency_id}\u0000${r.route_number}`;

/** @param {string | null | undefined} t */
const time = (t) => (t ? Date.parse(t) : 0);

/** @param {string} userId */
export async function syncSightings(userId) {
	if (!supabase) return;

	const owner = await getMeta('owner');
	if (owner && owner !== userId) await clearSightings();

	const { data: remoteRows, error } = await supabase
		.from(TABLE)
		.select('agency_id, route_number, seen, seen_at, updated_at')
		.eq('user_id', userId);
	if (error) throw error;

	const local = await getSightings();
	const remote = new Map(remoteRows.map((r) => [keyOf(r), r]));

	/** @type {any[]} */
	const toPush = [];
	/** @type {{ record: any, expectedUpdatedAt: string | null }[]} */
	const writes = [];

	for (const l of local) {
		const r = remote.get(keyOf(l));
		remote.delete(keyOf(l));
		if (!r || time(l.updated_at) > time(r.updated_at)) {
			toPush.push(l);
		} else if (time(r.updated_at) > time(l.updated_at)) {
			writes.push({ record: { ...r, dirty: 0 }, expectedUpdatedAt: l.updated_at });
		} else if (l.dirty) {
			writes.push({ record: { ...l, dirty: 0 }, expectedUpdatedAt: l.updated_at });
		}
	}
	// Rows that only exist remotely (e.g. seen on another device).
	for (const r of remote.values()) {
		writes.push({ record: { ...r, dirty: 0 }, expectedUpdatedAt: null });
	}

	if (toPush.length) {
		const { error: pushError } = await supabase.from(TABLE).upsert(
			toPush.map((l) => ({
				user_id: userId,
				agency_id: l.agency_id,
				route_number: l.route_number,
				seen: l.seen,
				seen_at: l.seen_at,
				updated_at: l.updated_at
			})),
			{ onConflict: 'user_id,agency_id,route_number' }
		);
		if (pushError) throw pushError;
		for (const l of toPush) {
			writes.push({ record: { ...l, dirty: 0 }, expectedUpdatedAt: l.updated_at });
		}
	}

	await applySynced(writes);
	await setMeta('owner', userId);
}
