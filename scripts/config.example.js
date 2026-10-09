/* ====================================================================
   LRD PointCalc — Developer Configuration Template
   ====================================================================
   Copy this file to `scripts/config.js` and insert your credentials.
   DO NOT commit `scripts/config.js` to version control.
   ==================================================================== */

(function (window) {
  'use strict';

  const SUPABASE_CONFIG = {
    supabaseUrl: window.ENV?.SUPABASE_URL || 'YOUR_SUPABASE_PROJECT_URL',
    supabasePublicKey: window.ENV?.SUPABASE_PUBLIC_KEY || window.ENV?.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_PUBLIC_KEY',
  };

  function isConfigured() {
    return Boolean(
      SUPABASE_CONFIG.supabaseUrl &&
      SUPABASE_CONFIG.supabasePublicKey &&
      SUPABASE_CONFIG.supabaseUrl.startsWith('https://') &&
      SUPABASE_CONFIG.supabasePublicKey.length > 10 &&
      !SUPABASE_CONFIG.supabaseUrl.includes('YOUR_SUPABASE')
    );
  }

  const hasSupabaseSdk = typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function';
  let supabaseClient = null;

  if (hasSupabaseSdk && isConfigured()) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.supabaseUrl, SUPABASE_CONFIG.supabasePublicKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      });
      console.log('LRD PointCalc: Connected to Supabase Auth');
    } catch (err) {
      console.error('LRD PointCalc: Error initializing Supabase client:', err);
    }
  }

  window.escapeHtml = function (str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  window.LRD_CONFIG = {
    getUrl: () => SUPABASE_CONFIG.supabaseUrl,
    getPublicKey: () => SUPABASE_CONFIG.supabasePublicKey,
    getClient: () => supabaseClient,
    isConfigured: isConfigured,
    hasSupabaseSdk: () => hasSupabaseSdk,
  };
})(window);
