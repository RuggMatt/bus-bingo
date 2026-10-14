// agencies.js
// Transit agencies the app knows about. Only Edmonton exists today, but every
// route and sighting is keyed by agency_id so more cities can be added later.
// Keep ids in sync with the `agencies` table in supabase/migrations.

/**
 * @typedef {{ route_number: string, description: string }} Route
 * @typedef {{
 *   id: string,
 *   name: string,
 *   city: string,
 *   routesUrl: string,
 *   parseRoutes: (rows: any[]) => Route[],
 *   groups: string[],
 *   groupFor: (route_number: string) => string
 * }} Agency
 */

/** @type {Record<string, Agency>} */
export const AGENCIES = {
	ets: {
		id: 'ets',
		name: 'Edmonton Transit Service',
		city: 'Edmonton',
		routesUrl: 'https://data.edmonton.ca/resource/d577-xky7.json',
		parseRoutes: (rows) =>
			rows.map((row) => ({
				route_number: String(row.route_id),
				description: row.route_long_name || row.route_short_name || ''
			})),
		groups: ['0-99', '100-199', '200-299', '400-499', '500-599', '700-799', '900-999', 'Other'],
		groupFor: (route_number) => {
			const n = parseInt(route_number);
			if (n >= 0 && n < 100) return '0-99';
			if (n >= 100 && n < 200) return '100-199';
			if (n >= 200 && n < 300) return '200-299';
			if (n >= 400 && n < 500) return '400-499';
			if (n >= 500 && n < 600) return '500-599';
			if (n >= 700 && n < 800) return '700-799';
			if (n >= 900 && n < 1000) return '900-999';
			return 'Other';
		}
	}
};

export const DEFAULT_AGENCY_ID = 'ets';
