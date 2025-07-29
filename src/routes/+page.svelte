<script>
import { onMount } from 'svelte';
import { buses, fetchBuses, markBusSeen } from '../lib/busStore.js';

function toggleBusSeen(bus) {
  if (bus.seen) {
    markBusSeen(bus.route_number, false);
  } else {
    markBusSeen(bus.route_number, true);
  }
}

let busList = [];
buses.subscribe(val => busList = val);

onMount(() => {
  fetchBuses();
});

function getGroups(list) {
  const groups = {
    '0-99': [],
    '100-199': [],
    '200-299': [],
    '400-499': [],
    '500-599': [],
    '700-799': [],
    '900-999': [],
    'Other': []
  };
  list.forEach(bus => {
    const n = parseInt(bus.route_number);
    if (n >= 0 && n < 100) groups['0-99'].push(bus);
    else if (n >= 100 && n < 200) groups['100-199'].push(bus);
    else if (n >= 200 && n < 300) groups['200-299'].push(bus);
    else if (n >= 400 && n < 500) groups['400-499'].push(bus);
    else if (n >= 500 && n < 600) groups['500-599'].push(bus);
    else if (n >= 700 && n < 800) groups['700-799'].push(bus);
    else if (n >= 900 && n < 1000) groups['900-999'].push(bus);
    else groups['Other'].push(bus);
  });
  return groups;
}
</script>

<main class="container">
    <h1>Bus Bingo</h1>
    <p>Mark off which buses you've seen around Edmonton!</p>
    {#if busList.length === 0}
        <p>Loading bus data...</p>
    {:else}
        {#each Object.entries(getGroups(busList)) as [range, buses]}
            <details>
                <summary>{range}</summary>
                <div class="bus-grid">
                    {#each buses.sort((a, b) => a.route_number - b.route_number) as bus}
                        <button
                            type="button"
                            class="bus-box {bus.seen ? 'seen' : ''}"
                            title={bus.description}
                            aria-pressed={bus.seen}
                            on:click={() => toggleBusSeen(bus)}
                        >
                            {bus.route_number.replace(/^0+/, '')}
                        </button>
                    {/each}
                </div>
            </details>
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