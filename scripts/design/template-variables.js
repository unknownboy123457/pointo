/* ====================================================================
   LRD PointCalc — Template Variables & Data Binding Module
   ====================================================================
   PURPOSE:
   Provides variable definitions, interpolation, and default dynamic
   metadata for point-table design templates.
   ==================================================================== */

(function (window) {
  'use strict';

  // Category definitions for fields
  const VARIABLE_CATEGORIES = {
    TOURNAMENT: 'Tournament Data',
    SOCIAL: 'Social & Media',
    TABLE: 'Tournament Table',
    BRANDING: 'Branding & Graphics',
  };

  // Predefined dynamic variables available to the template engine
  const AVAILABLE_VARIABLES = [
    // Tournament Data
    {
      key: 'tournament.name',
      label: 'Tournament Name',
      category: VARIABLE_CATEGORIES.TOURNAMENT,
      tag: '{{tournament.name}}',
      defaultVal: 'LRD THUNDER STRIKE CUP',
      description: 'Full name of the tournament',
    },
    {
      key: 'tournament.matchNumber',
      label: 'Match Number',
      category: VARIABLE_CATEGORIES.TOURNAMENT,
      tag: '{{tournament.matchNumber}}',
      defaultVal: 'MATCH 01',
      description: 'Current match number or title (e.g. Match 1, Final)',
    },
    {
      key: 'tournament.date',
      label: 'Date',
      category: VARIABLE_CATEGORIES.TOURNAMENT,
      tag: '{{tournament.date}}',
      defaultVal: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      description: 'Tournament or match date',
    },
    {
      key: 'tournament.organizer',
      label: 'Organizer Name',
      category: VARIABLE_CATEGORIES.TOURNAMENT,
      tag: '{{tournament.organizer}}',
      defaultVal: 'LRD Esports',
      description: 'Host or organizer organization',
    },
    {
      key: 'tournament.gameMode',
      label: 'Game Mode',
      category: VARIABLE_CATEGORIES.TOURNAMENT,
      tag: '{{tournament.gameMode}}',
      defaultVal: 'Squad (Battle Royale)',
      description: 'Free Fire game mode (Solo, Duo, Squad)',
    },
    {
      key: 'tournament.header',
      label: 'Custom Header',
      category: VARIABLE_CATEGORIES.TOURNAMENT,
      tag: '{{tournament.header}}',
      defaultVal: 'OVERALL STANDINGS',
      description: 'Custom title header above table',
    },
    {
      key: 'tournament.footer',
      label: 'Custom Footer',
      category: VARIABLE_CATEGORIES.TOURNAMENT,
      tag: '{{tournament.footer}}',
      defaultVal: 'OFFICIAL FREE FIRE POINT SYSTEM — 12-9-8-7-6-5-4-3-2-1-0-0',
      description: 'Custom footnote or rules text',
    },

    // Social Media
    {
      key: 'tournament.youtube',
      label: 'YouTube Channel',
      category: VARIABLE_CATEGORIES.SOCIAL,
      tag: '{{tournament.youtube}}',
      defaultVal: 'LRD ESPORTS',
      description: 'Official YouTube channel name or URL',
    },
    {
      key: 'tournament.instagram',
      label: 'Instagram Handle',
      category: VARIABLE_CATEGORIES.SOCIAL,
      tag: '{{tournament.instagram}}',
      defaultVal: '@LRDESPORTS',
      description: 'Instagram handle or tag',
    },
    {
      key: 'tournament.whatsapp',
      label: 'WhatsApp Community',
      category: VARIABLE_CATEGORIES.SOCIAL,
      tag: '{{tournament.whatsapp}}',
      defaultVal: '+91 98765 43210',
      description: 'WhatsApp number or group link',
    },
    {
      key: 'tournament.website',
      label: 'Website',
      category: VARIABLE_CATEGORIES.SOCIAL,
      tag: '{{tournament.website}}',
      defaultVal: 'lrdesports.com',
      description: 'Website or registration link',
    },

    // Leaderboard Row Variables (for repeating rows / table columns)
    {
      key: 'row.rank',
      label: 'Rank (#)',
      category: VARIABLE_CATEGORIES.TABLE,
      tag: '{{row.rank}}',
      defaultVal: '1',
      description: 'Team placement rank in standings',
    },
    {
      key: 'row.teamName',
      label: 'Team Name',
      category: VARIABLE_CATEGORIES.TABLE,
      tag: '{{row.teamName}}',
      defaultVal: 'Total Gaming',
      description: 'Registered team name',
    },
    {
      key: 'row.position',
      label: 'Match Placement',
      category: VARIABLE_CATEGORIES.TABLE,
      tag: '{{row.position}}',
      defaultVal: '1',
      description: 'Match placement finish position',
    },
    {
      key: 'row.kills',
      label: 'Kills',
      category: VARIABLE_CATEGORIES.TABLE,
      tag: '{{row.kills}}',
      defaultVal: '12',
      description: 'Total kills secured',
    },
    {
      key: 'row.placementPoints',
      label: 'Placement Points',
      category: VARIABLE_CATEGORIES.TABLE,
      tag: '{{row.placementPoints}}',
      defaultVal: '12',
      description: 'Points earned from match placement',
    },
    {
      key: 'row.killPoints',
      label: 'Kill Points',
      category: VARIABLE_CATEGORIES.TABLE,
      tag: '{{row.killPoints}}',
      defaultVal: '12',
      description: 'Points earned from kills',
    },
    {
      key: 'row.totalPoints',
      label: 'Total Points',
      category: VARIABLE_CATEGORIES.TABLE,
      tag: '{{row.totalPoints}}',
      defaultVal: '24',
      description: 'Sum of placement points and kill points',
    },
    {
      key: 'row.matchesPlayed',
      label: 'Matches Played',
      category: VARIABLE_CATEGORIES.TABLE,
      tag: '{{row.matchesPlayed}}',
      defaultVal: '3',
      description: 'Total matches played in tournament',
    },
    {
      key: 'row.booyahs',
      label: 'Booyahs (Wins)',
      category: VARIABLE_CATEGORIES.TABLE,
      tag: '{{row.booyahs}}',
      defaultVal: '1',
      description: 'Total 1st place finishes',
    },
  ];

  /**
   * Get default template information metadata
   */
  function getDefaultInfo() {
    return {
      tournamentName: 'LRD THUNDER STRIKE CUP',
      matchNumber: 'MATCH 01',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      organizer: 'LRD Esports',
      youtube: 'LRD ESPORTS',
      instagram: '@LRDESPORTS',
      whatsapp: '',
      website: '',
      header: 'OVERALL STANDINGS',
      footer: 'OFFICIAL FREE FIRE POINT SYSTEM — 12-9-8-7-6-5-4-3-2-1-0-0',
    };
  }

  /**
   * Build a flat lookup map from context
   * @param {Object} context - { tournament, match, info, row }
   */
  function buildLookup(context = {}) {
    const info = context.info || getDefaultInfo();
    const tournament = context.tournament || {};
    const match = context.match || {};
    const row = context.row || {};

    return {
      'tournament.name': info.tournamentName || tournament.name || 'LRD Tournament',
      'tournament.matchNumber': match.match_number ? `MATCH ${String(match.match_number).padStart(2, '0')}` : (info.matchNumber || 'OVERALL'),
      'tournament.date': info.date || (tournament.created_at ? new Date(tournament.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''),
      'tournament.organizer': info.organizer || 'LRD Esports',
      'tournament.gameMode': tournament.game_mode ? tournament.game_mode.toUpperCase() : 'SQUAD',
      'tournament.youtube': info.youtube || '',
      'tournament.instagram': info.instagram || '',
      'tournament.whatsapp': info.whatsapp || '',
      'tournament.website': info.website || '',
      'tournament.header': info.header || 'STANDINGS',
      'tournament.footer': info.footer || '',

      // Row values
      'row.rank': row.rank !== undefined ? String(row.rank) : '1',
      'row.teamName': row.teamName || row.name || 'Team Name',
      'row.position': row.placement !== undefined ? String(row.placement) : (row.position !== undefined ? String(row.position) : '-'),
      'row.kills': row.kills !== undefined ? String(row.kills) : '0',
      'row.placementPoints': row.placementPoints !== undefined ? String(row.placementPoints) : (row.placement_points !== undefined ? String(row.placement_points) : '0'),
      'row.killPoints': row.killPoints !== undefined ? String(row.killPoints) : (row.kill_points !== undefined ? String(row.kill_points) : '0'),
      'row.totalPoints': row.totalPoints !== undefined ? String(row.totalPoints) : (row.total_points !== undefined ? String(row.total_points) : '0'),
      'row.matchesPlayed': row.matchesPlayed !== undefined ? String(row.matchesPlayed) : '1',
      'row.booyahs': row.booyahs !== undefined ? String(row.booyahs) : (row.placement === 1 ? '1' : '0'),
    };
  }

  /**
   * Resolve template variables within a string:
   * e.g. "Welcome to {{tournament.name}}" -> "Welcome to LRD THUNDER STRIKE CUP"
   */
  function resolveVariables(templateText, context = {}) {
    if (!templateText || typeof templateText !== 'string') return '';
    const lookup = buildLookup(context);

    return templateText.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key) => {
      if (lookup.hasOwnProperty(key)) {
        return lookup[key];
      }
      return match;
    });
  }

  /**
   * Extract all variable tags present in a text
   */
  function extractVariables(text) {
    if (!text || typeof text !== 'string') return [];
    const matches = text.match(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g);
    if (!matches) return [];
    return matches.map((m) => m.replace(/[\{\}\s]/g, ''));
  }

  // Export module
  const TemplateVariables = {
    VARIABLE_CATEGORIES,
    AVAILABLE_VARIABLES,
    getDefaultInfo,
    buildLookup,
    resolveVariables,
    extractVariables,
  };

  window.TemplateVariables = TemplateVariables;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TemplateVariables;
  }
})(typeof window !== 'undefined' ? window : global);
