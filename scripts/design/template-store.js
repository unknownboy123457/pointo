/* ====================================================================
   LRD PointCalc — Template Store & Registry Module
   ====================================================================
   PURPOSE:
   Manages built-in Free and Premium templates, along with user-imported
   and saved templates persisted in local storage.
   Strictly local — no tournament/template data sent to Supabase.
   ==================================================================== */

(function (window) {
  'use strict';

  const STORAGE_KEY = 'lrd_local_templates';

  // Standard esports 4:5 poster dimensions (high-res base)
  const CANVAS_DEFAULT = {
    width: 1080,
    height: 1350,
  };

  // ==================================================================
  // BUILT-IN TEMPLATES DEFINITION
  // ==================================================================

  /**
   * Helper to build standard leaderboard columns configuration
   */
  function createStandardColumns(options = {}) {
    return [
      { key: 'rank', label: '#', width: 80, align: 'center' },
      { key: 'teamName', label: 'TEAM NAME', width: 440, align: 'left' },
      { key: options.modeKey || 'position', label: options.modeLabel || 'PLC', width: 140, align: 'center' },
      { key: 'kills', label: 'KILLS', width: 140, align: 'center' },
      { key: 'totalPoints', label: 'PTS', width: 160, align: 'center', highlight: true },
    ];
  }

  // 1. FREE TEMPLATE: LRD Classic
  const TEMPLATE_LRD_CLASSIC = {
    id: 'tmpl_free_lrd_classic',
    name: 'LRD Classic',
    category: 'free',
    accessType: 'free',
    badge: 'FREE',
    tags: ['classic', 'gold', 'official', 'clean', 'standard'],
    description: 'Official LRD esports tournament layout with gold accents and high-visibility point breakdown.',
    canvas: { ...CANVAS_DEFAULT },
    colors: {
      primary: '#d4af37',
      secondary: '#ff4444',
      text: '#ffffff',
      accent: '#ffd700',
      background: '#0d0f18',
    },
    background: {
      type: 'gradient',
      value: 'linear-gradient(180deg, #0d0f18 0%, #06070b 100%)',
      overlay: 'radial-gradient(circle at 50% 0%, rgba(212, 175, 55, 0.15) 0%, transparent 60%)',
    },
    info: {
      tournamentName: 'LRD THUNDER STRIKE CUP',
      matchNumber: 'MATCH 01',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      organizer: 'LRD Esports',
      youtube: 'LRD ESPORTS',
      instagram: '@LRDESPORTS',
      header: 'OVERALL STANDINGS',
      footer: 'OFFICIAL FREE FIRE POINT SYSTEM — 12-9-8-7-6-5-4-3-2-1-0-0',
    },
    fields: [
      {
        id: 'f_classic_brand',
        type: 'text',
        content: 'FREE FIRE ESPORTS',
        x: 60,
        y: 60,
        width: 960,
        height: 36,
        fontSize: 22,
        fontFamily: 'Inter',
        fontWeight: '800',
        color: '#d4af37',
        alignment: 'center',
        letterSpacing: '4px',
        opacity: 0.9,
      },
      {
        id: 'f_classic_title',
        type: 'text',
        content: '{{tournament.name}}',
        x: 60,
        y: 105,
        width: 960,
        height: 60,
        fontSize: 48,
        fontFamily: 'Inter',
        fontWeight: '900',
        color: '#ffffff',
        alignment: 'center',
        letterSpacing: '1px',
        opacity: 1,
      },
      {
        id: 'f_classic_pill',
        type: 'text',
        content: '{{tournament.matchNumber}}  •  {{tournament.header}}',
        x: 240,
        y: 178,
        width: 600,
        height: 44,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#09090d',
        backgroundColor: '#d4af37',
        borderRadius: 22,
        alignment: 'center',
        letterSpacing: '2px',
        opacity: 1,
      },
      {
        id: 'f_classic_table',
        type: 'leaderboard',
        x: 60,
        y: 250,
        width: 960,
        height: 940,
        rowHeight: 64,
        headerHeight: 46,
        maxRows: 12,
        columns: createStandardColumns({ modeKey: 'position', modeLabel: 'PLC' }),
        headerStyle: {
          backgroundColor: 'rgba(212, 175, 55, 0.12)',
          color: '#d4af37',
          fontSize: 18,
          fontWeight: '800',
          letterSpacing: '1.5px',
          borderBottom: '2px solid rgba(212, 175, 55, 0.4)',
        },
        rowStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          alternateColor: 'rgba(255, 255, 255, 0.06)',
          color: '#ffffff',
          fontSize: 22,
          fontWeight: '600',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          top3Gold: true,
        },
      },
      {
        id: 'f_classic_yt',
        type: 'text',
        content: '▶  YouTube: {{tournament.youtube}}',
        x: 80,
        y: 1230,
        width: 440,
        height: 40,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#ff4444',
        alignment: 'left',
        letterSpacing: '0.5px',
      },
      {
        id: 'f_classic_ig',
        type: 'text',
        content: '📷  Instagram: {{tournament.instagram}}',
        x: 560,
        y: 1230,
        width: 440,
        height: 40,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#e1306c',
        alignment: 'right',
        letterSpacing: '0.5px',
      },
      {
        id: 'f_classic_footer',
        type: 'text',
        content: '{{tournament.footer}}',
        x: 60,
        y: 1285,
        width: 960,
        height: 30,
        fontSize: 14,
        fontFamily: 'Inter',
        fontWeight: '600',
        color: '#8e92a4',
        alignment: 'center',
        letterSpacing: '1px',
      },
    ],
  };

  // 2. FREE TEMPLATE: LRD Gold
  const TEMPLATE_LRD_GOLD = {
    id: 'tmpl_free_lrd_gold',
    aliases: ['tmpl_free_gold_elite'],
    name: 'LRD Gold',
    category: 'free',
    accessType: 'free',
    badge: 'FREE',
    tags: ['gold', 'elite', 'luxury', 'championship', 'pro'],
    description: 'Luxurious championship table with metallic gold headers, illuminated podium rows, and bold typography.',
    canvas: { ...CANVAS_DEFAULT },
    colors: {
      primary: '#ffd700',
      secondary: '#f5c518',
      text: '#fffdf5',
      accent: '#d4af37',
      background: '#120e06',
    },
    background: {
      type: 'gradient',
      value: 'linear-gradient(135deg, #120e06 0%, #080603 50%, #151109 100%)',
      overlay: 'radial-gradient(circle at 50% 20%, rgba(245, 197, 24, 0.18) 0%, transparent 60%)',
    },
    info: {
      tournamentName: 'LRD THUNDER STRIKE CUP',
      matchNumber: 'GRAND FINALS',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      organizer: 'LRD Esports',
      youtube: 'LRD ESPORTS',
      instagram: '@LRDESPORTS',
      header: 'CHAMPIONSHIP LEADERBOARD',
      footer: 'LRD POINTCALC • DETERMINISTIC SCORING ENGINE',
    },
    fields: [
      {
        id: 'f_gold_crest',
        type: 'text',
        content: '★ LRD GOLD CHAMPIONSHIP ★',
        x: 60,
        y: 50,
        width: 960,
        height: 34,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '800',
        color: '#f5c518',
        alignment: 'center',
        letterSpacing: '3px',
      },
      {
        id: 'f_gold_title',
        type: 'text',
        content: '{{tournament.name}}',
        x: 60,
        y: 95,
        width: 960,
        height: 64,
        fontSize: 50,
        fontFamily: 'Inter',
        fontWeight: '900',
        color: '#fffdf5',
        alignment: 'center',
        letterSpacing: '1.5px',
      },
      {
        id: 'f_gold_sub',
        type: 'text',
        content: '{{tournament.matchNumber}}  |  {{tournament.header}}',
        x: 60,
        y: 168,
        width: 960,
        height: 40,
        fontSize: 22,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#d4af37',
        alignment: 'center',
        letterSpacing: '2px',
      },
      {
        id: 'f_gold_table',
        type: 'leaderboard',
        x: 60,
        y: 230,
        width: 960,
        height: 970,
        rowHeight: 66,
        headerHeight: 48,
        maxRows: 12,
        columns: createStandardColumns({ modeKey: 'position', modeLabel: 'PLC' }),
        headerStyle: {
          backgroundColor: 'linear-gradient(90deg, #3d2c0b 0%, #1f1707 100%)',
          color: '#ffd700',
          fontSize: 18,
          fontWeight: '800',
          letterSpacing: '1.5px',
          borderBottom: '2px solid #ffd700',
        },
        rowStyle: {
          backgroundColor: 'rgba(255, 215, 0, 0.04)',
          alternateColor: 'rgba(255, 215, 0, 0.08)',
          color: '#ffffff',
          fontSize: 22,
          fontWeight: '700',
          borderBottom: '1px solid rgba(255, 215, 0, 0.15)',
          top3Gold: true,
        },
      },
      {
        id: 'f_gold_social',
        type: 'text',
        content: 'YouTube: {{tournament.youtube}}   •   Instagram: {{tournament.instagram}}',
        x: 60,
        y: 1235,
        width: 960,
        height: 40,
        fontSize: 22,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#f5c518',
        alignment: 'center',
        letterSpacing: '1px',
      },
      {
        id: 'f_gold_footer',
        type: 'text',
        content: '{{tournament.footer}}',
        x: 60,
        y: 1285,
        width: 960,
        height: 30,
        fontSize: 14,
        fontFamily: 'Inter',
        fontWeight: '600',
        color: '#9e8a5b',
        alignment: 'center',
        letterSpacing: '1px',
      },
    ],
  };

  // 3. FREE TEMPLATE: Dark Arena
  const TEMPLATE_DARK_ARENA = {
    id: 'tmpl_free_dark_arena',
    aliases: ['tmpl_free_dark_tournament'],
    name: 'Dark Arena',
    category: 'free',
    accessType: 'free',
    badge: 'FREE',
    tags: ['dark', 'arena', 'stealth', 'cyber', 'night'],
    description: 'High-contrast stealth dark theme with sharp cyber lines and cyan highlights for competitive Free Fire.',
    canvas: { ...CANVAS_DEFAULT },
    colors: {
      primary: '#00e5ff',
      secondary: '#ffd600',
      text: '#f0f3f8',
      accent: '#00e5ff',
      background: '#050608',
    },
    background: {
      type: 'gradient',
      value: 'linear-gradient(180deg, #050608 0%, #0a0c10 100%)',
      overlay: 'linear-gradient(90deg, rgba(0, 229, 255, 0.05) 0%, transparent 50%, rgba(255, 214, 0, 0.05) 100%)',
    },
    info: {
      tournamentName: 'LRD THUNDER STRIKE CUP',
      matchNumber: 'MATCH 01',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      organizer: 'LRD Esports',
      youtube: 'LRD ESPORTS',
      instagram: '@LRDESPORTS',
      header: 'ARENA STANDINGS',
      footer: 'OFFICIAL SCORING • 1ST 12 PTS • 1 PT / KILL',
    },
    fields: [
      {
        id: 'f_arena_badge',
        type: 'text',
        content: 'DARK ARENA ESPORTS DIVISION',
        x: 60,
        y: 55,
        width: 960,
        height: 30,
        fontSize: 18,
        fontFamily: 'Inter',
        fontWeight: '800',
        color: '#00e5ff',
        alignment: 'center',
        letterSpacing: '4px',
      },
      {
        id: 'f_arena_title',
        type: 'text',
        content: '{{tournament.name}}',
        x: 60,
        y: 95,
        width: 960,
        height: 60,
        fontSize: 46,
        fontFamily: 'Inter',
        fontWeight: '900',
        color: '#ffffff',
        alignment: 'center',
        letterSpacing: '1px',
      },
      {
        id: 'f_arena_meta',
        type: 'text',
        content: '{{tournament.matchNumber}}  /  {{tournament.header}}',
        x: 60,
        y: 165,
        width: 960,
        height: 40,
        fontSize: 22,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#ffd600',
        alignment: 'center',
        letterSpacing: '2px',
      },
      {
        id: 'f_arena_table',
        type: 'leaderboard',
        x: 60,
        y: 235,
        width: 960,
        height: 960,
        rowHeight: 64,
        headerHeight: 46,
        maxRows: 12,
        columns: createStandardColumns({ modeKey: 'position', modeLabel: 'PLC' }),
        headerStyle: {
          backgroundColor: '#10141e',
          color: '#00e5ff',
          fontSize: 18,
          fontWeight: '800',
          letterSpacing: '1.5px',
          borderBottom: '2px solid #00e5ff',
        },
        rowStyle: {
          backgroundColor: '#0c0e14',
          alternateColor: '#121620',
          color: '#f0f3f8',
          fontSize: 21,
          fontWeight: '600',
          borderBottom: '1px solid #1a1f2c',
          top3Gold: false,
        },
      },
      {
        id: 'f_arena_footer_social',
        type: 'text',
        content: 'YT: {{tournament.youtube}}   |   IG: {{tournament.instagram}}',
        x: 60,
        y: 1235,
        width: 960,
        height: 40,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#00e5ff',
        alignment: 'center',
        letterSpacing: '1px',
      },
      {
        id: 'f_arena_footer',
        type: 'text',
        content: '{{tournament.footer}}',
        x: 60,
        y: 1285,
        width: 960,
        height: 30,
        fontSize: 14,
        fontFamily: 'Inter',
        fontWeight: '600',
        color: '#6e7488',
        alignment: 'center',
        letterSpacing: '1px',
      },
    ],
  };

  // 4. FREE TEMPLATE: Neon Battle
  const TEMPLATE_NEON_BATTLE = {
    id: 'tmpl_free_neon_battle',
    name: 'Neon Battle',
    category: 'free',
    accessType: 'free',
    badge: 'FREE',
    tags: ['neon', 'battle', 'cyberpunk', 'vibrant', 'glow'],
    description: 'Vibrant neon purple & emerald battle royale board with glowing rank highlights.',
    canvas: { ...CANVAS_DEFAULT },
    colors: {
      primary: '#a855f7',
      secondary: '#10b981',
      text: '#ffffff',
      accent: '#ec4899',
      background: '#090412',
    },
    background: {
      type: 'gradient',
      value: 'linear-gradient(180deg, #090412 0%, #030107 100%)',
      overlay: 'radial-gradient(circle at 50% 10%, rgba(168, 85, 247, 0.22) 0%, transparent 60%)',
    },
    info: {
      tournamentName: 'NEON WARRIORS INVITATIONAL',
      matchNumber: 'MATCH 02',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      organizer: 'LRD Esports',
      youtube: 'LRD ESPORTS',
      instagram: '@LRDESPORTS',
      header: 'NEON BATTLE STANDINGS',
      footer: 'POWERED BY LRD POINTCALC',
    },
    fields: [
      {
        id: 'f_neon_tag',
        type: 'text',
        content: '⚡ NEON BATTLE SERIE ⚡',
        x: 60,
        y: 50,
        width: 960,
        height: 32,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '800',
        color: '#10b981',
        alignment: 'center',
        letterSpacing: '3px',
      },
      {
        id: 'f_neon_title',
        type: 'text',
        content: '{{tournament.name}}',
        x: 60,
        y: 95,
        width: 960,
        height: 60,
        fontSize: 48,
        fontFamily: 'Inter',
        fontWeight: '900',
        color: '#ffffff',
        alignment: 'center',
        letterSpacing: '1px',
      },
      {
        id: 'f_neon_sub',
        type: 'text',
        content: '{{tournament.matchNumber}}  •  {{tournament.header}}',
        x: 60,
        y: 165,
        width: 960,
        height: 40,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#ec4899',
        alignment: 'center',
        letterSpacing: '2px',
      },
      {
        id: 'f_neon_table',
        type: 'leaderboard',
        x: 60,
        y: 235,
        width: 960,
        height: 960,
        rowHeight: 64,
        headerHeight: 46,
        maxRows: 12,
        columns: createStandardColumns({ modeKey: 'position', modeLabel: 'PLC' }),
        headerStyle: {
          backgroundColor: 'rgba(168, 85, 247, 0.2)',
          color: '#c084fc',
          fontSize: 18,
          fontWeight: '800',
          letterSpacing: '1.5px',
          borderBottom: '2px solid #a855f7',
        },
        rowStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          alternateColor: 'rgba(168, 85, 247, 0.05)',
          color: '#ffffff',
          fontSize: 21,
          fontWeight: '600',
          borderBottom: '1px solid rgba(168, 85, 247, 0.15)',
          top3Gold: false,
        },
      },
      {
        id: 'f_neon_social',
        type: 'text',
        content: 'YouTube: {{tournament.youtube}}  |  Instagram: {{tournament.instagram}}',
        x: 60,
        y: 1235,
        width: 960,
        height: 40,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#10b981',
        alignment: 'center',
        letterSpacing: '1px',
      },
      {
        id: 'f_neon_footer',
        type: 'text',
        content: '{{tournament.footer}}',
        x: 60,
        y: 1285,
        width: 960,
        height: 30,
        fontSize: 14,
        fontFamily: 'Inter',
        fontWeight: '600',
        color: '#8b5cf6',
        alignment: 'center',
        letterSpacing: '1px',
      },
    ],
  };

  // 5. FREE TEMPLATE: Minimal Pro
  const TEMPLATE_MINIMAL_PRO = {
    id: 'tmpl_free_minimal_pro',
    name: 'Minimal Pro',
    category: 'free',
    accessType: 'free',
    badge: 'FREE',
    tags: ['minimal', 'pro', 'clean', 'simple', 'monochrome'],
    description: 'Clean monochrome tournament graphic with sleek typography and zero clutter.',
    canvas: { ...CANVAS_DEFAULT },
    colors: {
      primary: '#ffffff',
      secondary: '#94a3b8',
      text: '#ffffff',
      accent: '#38bdf8',
      background: '#0a0a0c',
    },
    background: {
      type: 'gradient',
      value: 'linear-gradient(180deg, #0d0e12 0%, #050507 100%)',
    },
    info: {
      tournamentName: 'LRD THUNDER STRIKE CUP',
      matchNumber: 'MATCH 01',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      organizer: 'LRD Esports',
      youtube: 'LRD ESPORTS',
      instagram: '@LRDESPORTS',
      header: 'OFFICIAL STANDINGS',
      footer: 'LRD POINTCALC PRO',
    },
    fields: [
      {
        id: 'f_min_header',
        type: 'text',
        content: 'FREE FIRE COMPETITIVE',
        x: 60,
        y: 60,
        width: 960,
        height: 30,
        fontSize: 18,
        fontFamily: 'Inter',
        fontWeight: '700',
        color: '#94a3b8',
        alignment: 'center',
        letterSpacing: '4px',
      },
      {
        id: 'f_min_title',
        type: 'text',
        content: '{{tournament.name}}',
        x: 60,
        y: 100,
        width: 960,
        height: 56,
        fontSize: 44,
        fontFamily: 'Inter',
        fontWeight: '800',
        color: '#ffffff',
        alignment: 'center',
        letterSpacing: '1px',
      },
      {
        id: 'f_min_meta',
        type: 'text',
        content: '{{tournament.matchNumber}} • {{tournament.header}}',
        x: 60,
        y: 165,
        width: 960,
        height: 36,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '600',
        color: '#38bdf8',
        alignment: 'center',
        letterSpacing: '1.5px',
      },
      {
        id: 'f_min_table',
        type: 'leaderboard',
        x: 60,
        y: 230,
        width: 960,
        height: 970,
        rowHeight: 64,
        headerHeight: 46,
        maxRows: 12,
        columns: createStandardColumns({ modeKey: 'position', modeLabel: 'PLC' }),
        headerStyle: {
          backgroundColor: '#161922',
          color: '#ffffff',
          fontSize: 18,
          fontWeight: '700',
          letterSpacing: '1px',
          borderBottom: '2px solid #334155',
        },
        rowStyle: {
          backgroundColor: '#0f1117',
          alternateColor: '#141720',
          color: '#e2e8f0',
          fontSize: 21,
          fontWeight: '600',
          borderBottom: '1px solid #1e2433',
          top3Gold: false,
        },
      },
      {
        id: 'f_min_footer',
        type: 'text',
        content: 'YouTube: {{tournament.youtube}}   •   Instagram: {{tournament.instagram}}',
        x: 60,
        y: 1245,
        width: 960,
        height: 36,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '600',
        color: '#94a3b8',
        alignment: 'center',
        letterSpacing: '1px',
      },
    ],
  };

  // ==================================================================
  // PREMIUM TEMPLATES (Access-Controlled)
  // ==================================================================

  // 6. PREMIUM: Broadcast Gold / Apex Championship
  const TEMPLATE_BROADCAST_GOLD = {
    id: 'tmpl_prem_apex_champ',
    aliases: ['tmpl_prem_broadcast_gold'],
    name: 'Broadcast Gold',
    category: 'premium',
    accessType: 'premium',
    badge: 'PREMIUM',
    isLocked: true,
    tags: ['premium', 'broadcast', 'gold', 'championship', 'tier-1'],
    description: 'Broadcast-grade major tournament graphic with animated banner ribbons, sponsor panels, and dual-stat spotlights.',
    canvas: { ...CANVAS_DEFAULT },
    colors: {
      primary: '#ffd700',
      secondary: '#ff6b00',
      text: '#ffffff',
      accent: '#eab308',
      background: '#150928',
    },
    background: {
      type: 'gradient',
      value: 'linear-gradient(135deg, #180928 0%, #0a0412 100%)',
      overlay: 'radial-gradient(circle at 50% 0%, rgba(255, 215, 0, 0.25) 0%, transparent 60%)',
    },
    info: {
      tournamentName: 'APEX MAJOR LEAGUE',
      matchNumber: 'FINALS DAY 3',
      header: 'GRAND STANDINGS',
      youtube: 'APEX ESPORTS',
      instagram: '@APEX_PRO',
    },
    fields: [
      {
        id: 'f_prem_badge',
        type: 'text',
        content: '★ BROADCAST TIER 1 FINALS ★',
        x: 60,
        y: 50,
        width: 960,
        height: 34,
        fontSize: 20,
        fontFamily: 'Inter',
        fontWeight: '800',
        color: '#ffd700',
        alignment: 'center',
        letterSpacing: '3px',
      },
      {
        id: 'f_prem_title',
        type: 'text',
        content: '{{tournament.name}}',
        x: 60,
        y: 95,
        width: 960,
        height: 64,
        fontSize: 50,
        fontFamily: 'Inter',
        fontWeight: '900',
        color: '#ffffff',
        alignment: 'center',
        letterSpacing: '1.5px',
      },
      {
        id: 'f_prem_table',
        type: 'leaderboard',
        x: 60,
        y: 220,
        width: 960,
        height: 980,
        rowHeight: 66,
        headerHeight: 48,
        maxRows: 12,
        columns: createStandardColumns({ modeKey: 'position', modeLabel: 'PLC' }),
        headerStyle: {
          backgroundColor: 'linear-gradient(90deg, #3b1959 0%, #1f0b33 100%)',
          color: '#ffd700',
          fontSize: 18,
          fontWeight: '800',
          letterSpacing: '1.5px',
          borderBottom: '2px solid #ffd700',
        },
        rowStyle: {
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          alternateColor: 'rgba(255, 215, 0, 0.05)',
          color: '#ffffff',
          fontSize: 22,
          fontWeight: '700',
          borderBottom: '1px solid rgba(255, 215, 0, 0.15)',
          top3Gold: true,
        },
      },
    ],
  };

  // 7. PREMIUM: Cyber Neon Pro
  const TEMPLATE_CYBER_NEON_PRO = {
    id: 'tmpl_prem_neon_cyber',
    name: 'Cyber Neon Pro',
    category: 'premium',
    accessType: 'premium',
    badge: 'PREMIUM',
    isLocked: true,
    tags: ['premium', 'cyber', 'neon', 'magenta', 'cyan'],
    description: 'Electrifying neon magenta and cyan cybernetic border design for pro tournament broadcasts.',
    canvas: { ...CANVAS_DEFAULT },
    colors: {
      primary: '#06b6d4',
      secondary: '#f43f5e',
      text: '#ffffff',
      accent: '#a855f7',
      background: '#090314',
    },
    background: {
      type: 'gradient',
      value: 'linear-gradient(180deg, #090314 0%, #030108 100%)',
      overlay: 'radial-gradient(circle at 50% 10%, rgba(6, 182, 212, 0.25) 0%, transparent 60%)',
    },
    info: {
      tournamentName: 'CYBER CLASH INVITATIONAL',
      matchNumber: 'MATCH 06',
      header: 'LEADERBOARD',
      youtube: 'CYBER ESPORTS',
      instagram: '@CYBER_PRO',
    },
    fields: [
      {
        id: 'f_cyber_title',
        type: 'text',
        content: '{{tournament.name}}',
        x: 60,
        y: 80,
        width: 960,
        height: 64,
        fontSize: 48,
        fontFamily: 'Inter',
        fontWeight: '900',
        color: '#ffffff',
        alignment: 'center',
        letterSpacing: '1.5px',
      },
      {
        id: 'f_cyber_table',
        type: 'leaderboard',
        x: 60,
        y: 200,
        width: 960,
        height: 1000,
        rowHeight: 66,
        headerHeight: 48,
        maxRows: 12,
        columns: createStandardColumns({ modeKey: 'position', modeLabel: 'PLC' }),
        headerStyle: {
          backgroundColor: '#110724',
          color: '#06b6d4',
          fontSize: 18,
          fontWeight: '800',
          letterSpacing: '1.5px',
          borderBottom: '2px solid #f43f5e',
        },
        rowStyle: {
          backgroundColor: 'rgba(6, 182, 212, 0.04)',
          alternateColor: 'rgba(244, 63, 94, 0.05)',
          color: '#ffffff',
          fontSize: 22,
          fontWeight: '700',
          borderBottom: '1px solid rgba(244, 63, 94, 0.2)',
          top3Gold: false,
        },
      },
    ],
  };

  // 8. PREMIUM: Royal Championship
  const TEMPLATE_ROYAL_CHAMPIONSHIP = {
    id: 'tmpl_prem_golden_royal',
    aliases: ['tmpl_prem_royal_championship'],
    name: 'Royal Championship',
    category: 'premium',
    accessType: 'premium',
    badge: 'PREMIUM',
    isLocked: true,
    tags: ['premium', 'royal', 'championship', 'gold', 'crown'],
    description: 'Crest-adorned royal gold championship card with illuminated crown badges for top fraggers.',
    canvas: { ...CANVAS_DEFAULT },
    colors: {
      primary: '#fbbf24',
      secondary: '#dc2626',
      text: '#ffffff',
      accent: '#f59e0b',
      background: '#1f1402',
    },
    background: {
      type: 'gradient',
      value: 'linear-gradient(135deg, #1f1402 0%, #0c0801 100%)',
      overlay: 'radial-gradient(circle at 50% 15%, rgba(251, 191, 36, 0.25) 0%, transparent 60%)',
    },
    info: {
      tournamentName: 'ROYAL MASTER SERIES',
      matchNumber: 'DAY 2',
      header: 'ROYAL LEADERBOARD',
      youtube: 'ROYAL ESPORTS',
      instagram: '@ROYAL_LEAGUE',
    },
    fields: [
      {
        id: 'f_royal_title',
        type: 'text',
        content: '{{tournament.name}}',
        x: 60,
        y: 80,
        width: 960,
        height: 64,
        fontSize: 50,
        fontFamily: 'Inter',
        fontWeight: '900',
        color: '#fbbf24',
        alignment: 'center',
        letterSpacing: '2px',
      },
      {
        id: 'f_royal_table',
        type: 'leaderboard',
        x: 60,
        y: 200,
        width: 960,
        height: 1000,
        rowHeight: 66,
        headerHeight: 48,
        maxRows: 12,
        columns: createStandardColumns({ modeKey: 'position', modeLabel: 'PLC' }),
        headerStyle: {
          backgroundColor: '#382305',
          color: '#fbbf24',
          fontSize: 18,
          fontWeight: '800',
          letterSpacing: '1.5px',
          borderBottom: '2px solid #fbbf24',
        },
        rowStyle: {
          backgroundColor: 'rgba(251, 191, 36, 0.05)',
          alternateColor: 'rgba(251, 191, 36, 0.1)',
          color: '#ffffff',
          fontSize: 22,
          fontWeight: '700',
          borderBottom: '1px solid rgba(251, 191, 36, 0.2)',
          top3Gold: true,
        },
      },
    ],
  };

  // Registry of all built-in templates
  const BUILTIN_TEMPLATES = [
    TEMPLATE_LRD_CLASSIC,
    TEMPLATE_LRD_GOLD,
    TEMPLATE_DARK_ARENA,
    TEMPLATE_NEON_BATTLE,
    TEMPLATE_MINIMAL_PRO,
    TEMPLATE_BROADCAST_GOLD,
    TEMPLATE_CYBER_NEON_PRO,
    TEMPLATE_ROYAL_CHAMPIONSHIP,
  ];

  // ==================================================================
  // LOCAL STORAGE CRUD HELPERS
  // ==================================================================

  function readCustomTemplates() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('TemplateStore: Failed to read local templates:', e);
      return [];
    }
  }

  function writeCustomTemplates(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('TemplateStore: Failed to save local templates:', e);
      return false;
    }
  }

  function generateTemplateId() {
    return `tmpl_custom_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // ==================================================================
  // ACCESS CONTROL LAYER
  // ==================================================================

  function isPremiumTemplateAllowed(templateId, user) {
    const tmpl = BUILTIN_TEMPLATES.find((t) => t.id === templateId || (t.aliases && t.aliases.includes(templateId)));
    if (!tmpl || tmpl.accessType !== 'premium') {
      return true;
    }

    if (user && user.user_metadata && user.user_metadata.is_premium === true) {
      return true;
    }

    if (window._LRD_PREMIUM_OVERRIDE === true) {
      return true;
    }

    return false;
  }

  // ==================================================================
  // PUBLIC TEMPLATE STORE API
  // ==================================================================

  const TemplateStore = {
    /**
     * Get all built-in free templates
     */
    getFreeTemplates() {
      return BUILTIN_TEMPLATES.filter((t) => t.accessType === 'free').map((t) => JSON.parse(JSON.stringify(t)));
    },

    /**
     * Get all built-in premium templates
     */
    getPremiumTemplates() {
      return BUILTIN_TEMPLATES.filter((t) => t.accessType === 'premium').map((t) => JSON.parse(JSON.stringify(t)));
    },

    /**
     * Get user's custom / imported templates partitioned by userId
     */
    getCustomTemplates(userId) {
      if (!userId) return [];
      const all = readCustomTemplates();
      return all
        .filter((t) => t.owner_user_id === userId)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    },

    /**
     * Get all templates available to the user (Free, Premium, Custom)
     */
    getAllTemplates(userId) {
      const free = this.getFreeTemplates();
      const premium = this.getPremiumTemplates();
      const custom = this.getCustomTemplates(userId);
      return { free, premium, custom };
    },

    /**
     * Retrieve any template by ID
     */
    getTemplateById(templateId, userId) {
      if (!templateId) return null;

      // Check built-in first
      const builtin = BUILTIN_TEMPLATES.find((t) => t.id === templateId || (t.aliases && t.aliases.includes(templateId)));
      if (builtin) {
        return JSON.parse(JSON.stringify(builtin));
      }

      // Check user custom templates
      if (userId) {
        const customList = readCustomTemplates();
        const found = customList.find((t) => t.id === templateId && t.owner_user_id === userId);
        if (found) return JSON.parse(JSON.stringify(found));
      }

      return null;
    },

    /**
     * Save a new custom/imported template
     */
    saveCustomTemplate(userId, templateData) {
      if (!userId) {
        throw new Error('User authentication required to save template.');
      }
      if (!templateData || !templateData.name) {
        throw new Error('Template name is required.');
      }

      const all = readCustomTemplates();
      const now = new Date().toISOString();

      const newTemplate = {
        id: templateData.id || generateTemplateId(),
        owner_user_id: userId,
        name: templateData.name.trim(),
        category: 'custom',
        accessType: 'free',
        badge: 'CUSTOM',
        description: templateData.description || 'Custom user template',
        canvas: templateData.canvas || { ...CANVAS_DEFAULT },
        colors: templateData.colors || {
          primary: '#d4af37',
          secondary: '#ffffff',
          text: '#ffffff',
          accent: '#ffd700',
          background: '#0d0f18',
        },
        background: templateData.background || {
          type: 'gradient',
          value: 'linear-gradient(180deg, #0d0f18 0%, #06070b 100%)',
        },
        info: templateData.info || window.TemplateVariables?.getDefaultInfo() || {},
        fields: Array.isArray(templateData.fields) ? templateData.fields : [],
        createdAt: now,
        updatedAt: now,
      };

      all.unshift(newTemplate);
      writeCustomTemplates(all);
      return newTemplate;
    },

    /**
     * Update an existing custom template
     */
    updateCustomTemplate(userId, templateId, updates) {
      if (!userId || !templateId) return null;

      const all = readCustomTemplates();
      const idx = all.findIndex((t) => t.id === templateId && t.owner_user_id === userId);
      if (idx === -1) return null;

      all[idx] = {
        ...all[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      writeCustomTemplates(all);
      return all[idx];
    },

    /**
     * Rename a custom template
     */
    renameTemplate(userId, templateId, newName) {
      if (!userId || !templateId || !newName) return null;
      return this.updateCustomTemplate(userId, templateId, { name: newName.trim() });
    },

    /**
     * Delete a custom template
     */
    deleteCustomTemplate(userId, templateId) {
      if (!userId || !templateId) return false;

      const all = readCustomTemplates();
      const filtered = all.filter((t) => !(t.id === templateId && t.owner_user_id === userId));

      if (filtered.length !== all.length) {
        writeCustomTemplates(filtered);
        return true;
      }
      return false;
    },

    /**
     * Duplicate a template into a new custom template
     */
    duplicateTemplate(userId, templateId) {
      const source = this.getTemplateById(templateId, userId);
      if (!source) return null;

      const copyData = {
        ...source,
        id: generateTemplateId(),
        name: `${source.name} (Copy)`,
        category: 'custom',
      };

      return this.saveCustomTemplate(userId, copyData);
    },

    /**
     * Search templates across name, description, tags and category
     */
    searchTemplates(query = '', category = 'all', userId = null) {
      const cleanQ = (query || '').trim().toLowerCase();
      const { free, premium, custom } = this.getAllTemplates(userId);

      let pool = [];
      if (category === 'free') pool = free;
      else if (category === 'premium') pool = premium;
      else if (category === 'custom') pool = custom;
      else pool = [...free, ...premium, ...custom];

      if (!cleanQ) return pool;

      return pool.filter((tmpl) => {
        const nameMatch = tmpl.name.toLowerCase().includes(cleanQ);
        const descMatch = (tmpl.description || '').toLowerCase().includes(cleanQ);
        const tagMatch = (tmpl.tags || []).some((t) => t.toLowerCase().includes(cleanQ));
        const catMatch = tmpl.category.toLowerCase().includes(cleanQ);
        return nameMatch || descMatch || tagMatch || catMatch;
      });
    },

    /**
     * Apply palette colors to a template definition
     */
    applyColorsToTemplate(template, colorObj = {}) {
      if (!template) return template;
      const copy = JSON.parse(JSON.stringify(template));
      copy.colors = { ...(copy.colors || {}), ...colorObj };

      // Apply to background if background color changed
      if (colorObj.background) {
        copy.background = {
          type: 'color',
          value: colorObj.background,
        };
      }

      // Update text fields if text or primary color changed
      if (copy.fields && Array.isArray(copy.fields)) {
        copy.fields.forEach((f) => {
          if (f.type === 'text') {
            if (colorObj.text) f.color = colorObj.text;
          } else if (f.type === 'leaderboard') {
            if (colorObj.primary && f.headerStyle) {
              f.headerStyle.color = colorObj.primary;
              f.headerStyle.borderBottom = `2px solid ${colorObj.primary}`;
            }
          }
        });
      }

      return copy;
    },

    /**
     * Apply background configuration to a template definition
     */
    applyBackgroundToTemplate(template, bgConfig) {
      if (!template || !bgConfig) return template;
      const copy = JSON.parse(JSON.stringify(template));
      copy.background = { ...bgConfig };
      return copy;
    },

    // Access control function
    isPremiumTemplateAllowed,

    // Expose default dimensions
    CANVAS_DEFAULT,
  };

  window.TemplateStore = TemplateStore;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TemplateStore;
  }
})(typeof window !== 'undefined' ? window : global);
