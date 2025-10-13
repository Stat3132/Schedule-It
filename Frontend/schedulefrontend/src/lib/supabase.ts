import { createClient } from '@supabase/supabase-js';

// Read public Supabase variables (these are safe for the browser)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error(
		'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.\n' +
			'Add them to Frontend/schedulefrontend/.env.local (do NOT commit secrets) or set them in your deployment platform.'
	);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
