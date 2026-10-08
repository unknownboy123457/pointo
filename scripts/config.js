/* ====================================================================
   LRD PointCalc — Developer Configuration & Real Supabase Client
   ====================================================================
   PURPOSE:
   Supabase is strictly used for:
   1. Google authentication
   2. User identity (user.id, email, full_name, avatar_url)
   3. Basic user profile display on the Account screen
   4. Future Premium status

   TOURNAMENTS ARE NEVER STORED IN SUPABASE.
   All tournament data is persisted strictly in the Local Database.
   ==================================================================== */

(function (window) {
  'use strict';

  // ==================================================================
  // REAL SUPABASE CREDENTIALS
  // ==================================================================
  const SUPABASE_CONFIG = {
    // Real Supabase Project URL
    supabaseUrl: window.ENV?.SUPABASE_URL || 'https://rxunwauuaxymnljytato.supabase.co',

    // Real Supabase Publishable Key
    supabasePublicKey: window.ENV?.SUPABASE_PUBLIC_KEY || window.ENV?.SUPABASE_ANON_KEY || 'sb_publishable_fY-JwLT0sIJu_bCMKofvrQ_niVcMvAk',
  };

  /**
   * Check if credentials are present
   */
  function isConfigured() {
    return Boolean(
      SUPABASE_CONFIG.supabaseUrl &&
      SUPABASE_CONFIG.supabasePublicKey &&
      SUPABASE_CONFIG.supabaseUrl.startsWith('https://') &&
      SUPABASE_CONFIG.supabasePublicKey.length > 10
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
      console.log('LRD PointCalc: Connected to Supabase Auth at', SUPABASE_CONFIG.supabaseUrl);
    } catch (err) {
      console.error('LRD PointCalc: Error initializing Supabase client:', err);
    }
  }

  // Global HTML Escape helper
  window.escapeHtml = function (str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // Export to window
  window.LRD_CONFIG = {
    getUrl: () => SUPABASE_CONFIG.supabaseUrl,
    getPublicKey: () => SUPABASE_CONFIG.supabasePublicKey,
    getClient: () => supabaseClient,
    isConfigured: isConfigured,
    hasSupabaseSdk: () => hasSupabaseSdk,
  };
})(window);
