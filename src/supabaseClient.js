import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // Surface a clear error in the UI rather than a cryptic network failure
  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:sans-serif;color:#e0603d;">' +
      '<h2>Missing Supabase configuration</h2>' +
      '<p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> ' +
      'in your <code>.env</code> file (local) or in Netlify → Site settings → ' +
      'Environment variables (deployed), then rebuild.</p></div>';
  });
  throw new Error('Missing Supabase env vars');
}

export const supabase = createClient(url, key);
