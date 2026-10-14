<script>
import { onMount } from 'svelte';
import { AGENCIES } from '$lib/agencies.js';
import { agencyId, buses, initAuth, loadBuses, loading, routesError, toggleSeen } from '$lib/busStore.js';
import AuthPanel from '$lib/components/AuthPanel.svelte';

const agency = $derived(AGENCIES[$agencyId]);
const seenCount = $derived($buses.filter((bus) => bus.seen).length);

onMount(() => {
  initAuth();
  loadBuses();
});

/** @param {typeof $buses} list */
function getGroups(list) {
  /** @type {Record<string, typeof $buses>} */
  const groups = Object.fromEntries(agency.groups.map((g) => [g, []]));
  list.forEach((bus) => groups[agency.groupFor(bus.route_number)].push(bus));
  return groups;
}
</script>

<main class="container">
    <h1>Bus Bingo</h1>
    <p>Mark off which buses you've seen around {agency.city}!</p>
    <AuthPanel />
    {#if $loading}
        <p aria-busy="true">Loading bus data...</p>
    {:else if $routesError}
        <p>{$routesError}</p>
    {:else}
        <p><strong>{seenCount}</strong> of {$buses.length} seen</p>
        {#each Object.entries(getGroups($buses)) as [range, group] (range)}
            {#if group.length}
                <details>
                    <summary>{range} ({group.filter((bus) => bus.seen).length}/{group.length})</summary>
                    <div class="bus-grid">
                        {#each group.toSorted((a, b) => Number(a.route_number) - Number(b.route_number)) as bus (bus.route_number)}
                            <button
                                type="button"
                                class="bus-box {bus.seen ? 'seen' : ''}"
                                title={bus.description}
                                aria-pressed={bus.seen}
                                onclick={() => toggleSeen(bus)}
                            >
                                {bus.route_number.replace(/^0+/, '')}
                            </button>
                        {/each}
                    </div>
                </details>
            {/if}
        {/each}
    {/if}
</main>

<style>
.bus-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, 100px);
    gap: 0.5rem;
    margin-bottom: 1rem;
}
.bus-box {
    /* background: #f0f0f0; */
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
    text-wrap: none;
    cursor: pointer;
    transition: background 0.2s;
    font-weight: bold;
    border: 2px solid #ddd;
}
.bus-box.seen {
    background: #1d4a1d;
    border-color: #8fd88f;
}
details {
    margin-bottom: 1.5rem;
}
summary {
    font-size: 1.1rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
}
</style>
