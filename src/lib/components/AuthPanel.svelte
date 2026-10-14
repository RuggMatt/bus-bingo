<script>
	import {
		authEnabled,
		hasUnsyncedChanges,
		sendSignInEmail,
		signOut,
		syncState,
		user,
		verifySignInCode
	} from '$lib/busStore.js';

	let email = $state('');
	let code = $state('');
	let step = $state(/** @type {'email' | 'code'} */ ('email'));
	let busy = $state(false);
	let message = $state('');

	const syncLabels = {
		idle: '',
		syncing: 'Syncing…',
		synced: 'Progress saved',
		offline: 'Offline — will sync when back online',
		error: 'Sync failed — will retry'
	};

	/** @param {() => Promise<void>} fn */
	async function run(fn) {
		busy = true;
		message = '';
		try {
			await fn();
		} catch (e) {
			message = /** @type {Error} */ (e).message || 'Something went wrong';
		} finally {
			busy = false;
		}
	}

	/** @param {SubmitEvent} e */
	function onSendEmail(e) {
		e.preventDefault();
		run(async () => {
			await sendSignInEmail(email.trim());
			step = 'code';
		});
	}

	/** @param {SubmitEvent} e */
	function onVerify(e) {
		e.preventDefault();
		run(async () => {
			await verifySignInCode(email.trim(), code.trim());
			code = '';
			step = 'email';
		});
	}

	function onSignOut() {
		run(async () => {
			if (
				(await hasUnsyncedChanges()) &&
				!confirm('Some changes have not synced yet and will be lost. Sign out anyway?')
			) {
				return;
			}
			await signOut();
		});
	}
</script>

{#if authEnabled}
	{#if $user}
		<article class="auth">
			<small>
				Signed in as <strong>{$user.email}</strong>
				{#if syncLabels[$syncState]}· {syncLabels[$syncState]}{/if}
			</small>
			<button type="button" class="outline secondary" disabled={busy} onclick={onSignOut}>
				Sign out
			</button>
		</article>
	{:else}
		<details class="auth-signin">
			<summary>Sign in to save your progress (optional)</summary>
			{#if step === 'email'}
				<form onsubmit={onSendEmail}>
					<!-- Pico styles fieldset[role=group] as an input group -->
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<fieldset role="group">
						<input
							type="email"
							bind:value={email}
							placeholder="you@example.com"
							autocomplete="email"
							required
						/>
						<button type="submit" disabled={busy}>Email me a code</button>
					</fieldset>
					<small>Buses you've already marked on this device will be saved to your account.</small>
				</form>
			{:else}
				<form onsubmit={onVerify}>
					<p>
						<small
							>We sent a code to <strong>{email}</strong>. Enter it below, or tap the link in the
							email.</small
						>
					</p>
					<!-- Pico styles fieldset[role=group] as an input group -->
					<!-- svelte-ignore a11y_no_redundant_roles -->
					<fieldset role="group">
						<input
							type="text"
							bind:value={code}
							inputmode="numeric"
							autocomplete="one-time-code"
							placeholder="Code"
							required
						/>
						<button type="submit" disabled={busy}>Sign in</button>
					</fieldset>
					<button type="button" class="outline secondary" onclick={() => (step = 'email')}>
						Use a different email
					</button>
				</form>
			{/if}
		</details>
	{/if}
	{#if message}<p class="error"><small>{message}</small></p>{/if}
{/if}

<style>
	.auth {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.75rem 1rem;
	}
	.auth button {
		margin: 0;
		padding: 0.25rem 0.75rem;
	}
	.error {
		color: var(--pico-del-color);
	}
</style>
