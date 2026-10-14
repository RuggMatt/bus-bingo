/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service worker: precaches the app shell so Bus Bingo opens offline. Route
// data and progress live in IndexedDB, so no API responses are cached here.
// SvelteKit registers this file automatically in production builds.
import { base, build, files, version } from '$service-worker';

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

const CACHE = `bus-bingo-${version}`;
const SHELL = `${base}/`;
const CDN_ASSETS = ['https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css'];
const ASSETS = [...build, ...files, SHELL];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(ASSETS);
			// Best effort: the app still works (unstyled) if the CDN is unreachable.
			await Promise.all(
				CDN_ASSETS.map((url) => cache.add(new Request(url, { mode: 'cors' })).catch(() => {}))
			);
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);

	// Page loads: network first so deploys show up, cached shell when offline.
	// Every route is served by the SPA shell (adapter-static fallback).
	if (request.mode === 'navigate' && url.origin === sw.location.origin) {
		event.respondWith(
			(async () => {
				try {
					return await fetch(request);
				} catch {
					return (await caches.match(SHELL)) ?? Response.error();
				}
			})()
		);
		return;
	}

	const precached =
		url.origin === sw.location.origin
			? ASSETS.includes(url.pathname)
			: CDN_ASSETS.includes(url.href);
	if (precached) {
		event.respondWith(
			(async () => (await caches.match(request, { ignoreVary: true })) ?? fetch(request))()
		);
	}
	// Everything else (Supabase, transit APIs) goes straight to the network.
});
