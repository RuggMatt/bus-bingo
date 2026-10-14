// supabase.js
// Supabase is optional: without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the
// app runs local-only and the sign-in UI is hidden.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
	url && key
		? createClient(url, key, {
				auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
			})
		: null;
