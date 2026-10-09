/* ====================================================================
   LRD PointCalc — Deterministic Free Fire Scoring Engine
   Single Source of Truth for Points & Leaderboards
   ====================================================================
   RULES:
   - ONLY for Free Fire esports scoring.
   - Deterministic integer calculations (No floats, no decimals, no NaN).
   - AI will NEVER calculate points; AI only extracts placement & kills.
   - Used for manual result entry, leaderboard aggregations, and future AI.
   ==================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js / CommonJS
    module.exports = factory();
  } else {
    // Browser global
    root.ScoringEngine = factory();
    root.ScoringService = root.ScoringEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ==================================================================
  // DEFAULT FREE FIRE OFFICIAL SCORING CONFIGURATION
  // 1st: 12, 2nd: 9, 3rd: 8, 4th: 7, 5th: 6, 6th: 5, 7th: 4, 8th: 3, 9th: 2, 10th: 1
  // 1 Kill = 1 Point
  // ==================================================================
  const DEFAULT_FREE_FIRE_SCORING = Object.freeze({
    type: 'default',
    placementPoints: Object.freeze({
      1: 12,
      2: 9,
      3: 8,
      4: 7,
      5: 6,
      6: 5,
      7: 4,
      8: 3,
      9: 2,
      10: 1,
    }),
    killPointValue: 1,
  });

  /**
   * Safely parse an integer, falling back to a default value
   */
  function toSafeInteger(val, fallback = 0) {
    if (val === null || val === undefined || val === '') return fallback;
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.floor(num);
  }

  /**
   * Normalize any scoring configuration object or type string
   */
  function normalizeConfig(config) {
    if (!config || config === 'default' || config.type === 'default' || !config.placementPoints) {
      return DEFAULT_FREE_FIRE_SCORING;
    }

    const customPlacements = {};
    const sourcePlacements = config.placementPoints || {};

    Object.keys(sourcePlacements).forEach((placeStr) => {
      const place = toSafeInteger(placeStr, 0);
      if (place > 0) {
        customPlacements[place] = Math.max(0, toSafeInteger(sourcePlacements[placeStr], 0));
      }
    });

    return {
      type: 'custom',
      placementPoints: customPlacements,
      killPointValue: Math.max(0, toSafeInteger(config.killPointValue, 1)),
    };
  }

  /**
   * Deterministic function to calculate points for an individual team:
   *
   * TOTAL POINTS = PLACEMENT POINTS + KILL POINTS
   *
   * @param {number|string} placement - The rank/place (1..N)
   * @param {number|string} kills - Non-negative kill count
   * @param {Object} [scoringConfig] - Optional tournament scoring configuration
   * @returns {{ placement: number, kills: number, placementPoints: number, killPoints: number, totalPoints: number }}
   */
  function calculateTeamPoints(placement, kills, scoringConfig, multiplier = 1) {
    const config = normalizeConfig(scoringConfig);

    const safePlacement = toSafeInteger(placement, 0);
    // Kills must be a non-negative integer
    const rawKills = toSafeInteger(kills, 0);
    const safeKills = Math.max(0, rawKills);

    // Calculate placement points (default to 0 if placement not in point table)
    let placementPoints = 0;
    if (safePlacement > 0 && config.placementPoints && config.placementPoints[safePlacement] !== undefined) {
      placementPoints = toSafeInteger(config.placementPoints[safePlacement], 0);
    }

    // Calculate kill points
    const killPointVal = toSafeInteger(config.killPointValue, 1);
    const killPoints = safeKills * killPointVal;

    // Multiplier support (default 1x)
    const mult = Number(multiplier) > 0 ? Number(multiplier) : 1;
    const basePoints = placementPoints + killPoints;
    const totalPoints = Math.round(basePoints * mult);

    return {
      placement: safePlacement,
      kills: safeKills,
      placementPoints,
      killPoints,
      multiplier: mult,
      totalPoints,
    };
  }

  /**
   * Validate raw match entries for duplicate placements, negative kills, and completeness
   *
   * @param {Array<{ teamId: string, placement: number|string, kills: number|string }>} entries
   * @param {number} teamCount - Total number of participating teams
   * @returns {{ valid: boolean, errors: string[], duplicatePlacements: number[], invalidTeams: string[] }}
   */
  function validateMatchResults(entries, teamCount = 12) {
    const errors = [];
    const placementCounts = new Map();
    const duplicatePlacements = [];
    const invalidTeams = [];

    if (!Array.isArray(entries) || entries.length === 0) {
      return {
        valid: false,
        errors: ['No team results provided.'],
        duplicatePlacements: [],
        invalidTeams: [],
      };
    }

    entries.forEach((entry, idx) => {
      const teamId = entry.teamId || `team_${idx}`;
      const rawPlace = entry.placement;
      const rawKills = entry.kills;

      // Check placement validity
      const place = Number(rawPlace);
      if (!Number.isInteger(place) || place <= 0) {
        errors.push(`Team "${entry.teamName || teamId}" has an invalid placement: ${rawPlace}`);
        invalidTeams.push(teamId);
      } else if (place > teamCount) {
        errors.push(`Placement #${place} exceeds total teams (${teamCount})`);
        invalidTeams.push(teamId);
      } else {
        const count = (placementCounts.get(place) || 0) + 1;
        placementCounts.set(place, count);
        if (count === 2) {
          duplicatePlacements.push(place);
        }
      }

      // Check kills validity
      const killsNum = Number(rawKills);
      if (!Number.isInteger(killsNum) || killsNum < 0) {
        errors.push(`Team "${entry.teamName || teamId}" has invalid negative kills: ${rawKills}`);
        if (!invalidTeams.includes(teamId)) invalidTeams.push(teamId);
      }
    });

    if (duplicatePlacements.length > 0) {
      duplicatePlacements.forEach((dp) => {
        errors.push(`Duplicate placement: Placement #${dp} is assigned to multiple teams.`);
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      duplicatePlacements,
      invalidTeams,
    };
  }

  /**
   * Calculate and sort the leaderboard for a single match deterministically:
   * 1. Total Points DESC
   * 2. Kill Points DESC
   * 3. Placement Points DESC
   * 4. Placement ASC
   *
   * @param {Array<Object>} rawResults - List of team entries with placement and kills
   * @param {Object} [scoringConfig] - Scoring configuration
   * @returns {Array<Object>} Deterministically ranked match leaderboard
   */
  function calculateMatchLeaderboard(rawResults, scoringConfig, defaultMultiplier = 1) {
    const config = normalizeConfig(scoringConfig);

    const calculated = (rawResults || []).map((entry) => {
      const mult = (entry.multiplier !== undefined && entry.multiplier !== null)
        ? Number(entry.multiplier)
        : defaultMultiplier;
      const pts = calculateTeamPoints(entry.placement, entry.kills, config, mult);
      return {
        ...entry,
        placement: pts.placement,
        kills: pts.kills,
        placementPoints: pts.placementPoints,
        killPoints: pts.killPoints,
        multiplier: pts.multiplier,
        totalPoints: pts.totalPoints,
      };
    });

    // Deterministic Sort
    calculated.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      if (b.killPoints !== a.killPoints) {
        return b.killPoints - a.killPoints;
      }
      if (b.placementPoints !== a.placementPoints) {
        return b.placementPoints - a.placementPoints;
      }
      return a.placement - b.placement;
    });

    // Assign rank
    return calculated.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }

  /**
   * Calculate and aggregate the tournament overall leaderboard across all matches deterministically:
   *
   * Overall Points = Sum of all match total points
   * Overall Kills = Sum of all match kills
   * Overall Placement Points = Sum of all match placement points
   * Overall Kill Points = Sum of all match kill points
   *
   * Deterministic Tiebreaker:
   * 1. Total Points DESC
   * 2. Total Kills DESC
   * 3. Total Placement Points DESC
   * 4. Total Booyahs (1st places) DESC
   * 5. Team Name ASC
   *
   * @param {Array<{ id: string, name: string }>} teams
   * @param {Array<Object>} matches - Matches in the tournament
   * @param {Array<Object>} matchResults - All match result records
   * @param {Object} [scoringConfig]
   * @returns {Array<Object>} Deterministically ranked tournament overall leaderboard
   */
  function calculateTournamentLeaderboard(teams, matches, matchResults, scoringConfig) {
    const config = normalizeConfig(scoringConfig);

    const matchMap = new Map((matches || []).map((m) => [m.id, m]));
    const matchIds = new Set(matchMap.keys());
    const relevantResults = (matchResults || []).filter((r) => matchIds.has(r.match_id));

    // Initialize team stats map
    const teamMap = new Map();
    (teams || []).forEach((t) => {
      teamMap.set(t.id, {
        teamId: t.id,
        teamName: t.name || 'Unnamed Team',
        matchesPlayed: 0,
        totalKills: 0,
        placementPoints: 0,
        killPoints: 0,
        totalPoints: 0,
        booyahs: 0, // Count of 1st places
        matchPlacements: [],
      });
    });

    // Accumulate each match result
    relevantResults.forEach((r) => {
      if (!teamMap.has(r.team_id)) {
        // Fallback for team defined only in result
        teamMap.set(r.team_id, {
          teamId: r.team_id,
          teamName: r.team_name || 'Team ' + r.team_id.slice(-4),
          matchesPlayed: 0,
          totalKills: 0,
          placementPoints: 0,
          killPoints: 0,
          totalPoints: 0,
          booyahs: 0,
          matchPlacements: [],
        });
      }

      const team = teamMap.get(r.team_id);
      const matchObj = matchMap.get(r.match_id);
      const mult = (r.multiplier !== undefined && r.multiplier !== null)
        ? Number(r.multiplier)
        : (matchObj && matchObj.multiplier ? Number(matchObj.multiplier) : 1);

      // Deterministically recalculate points using the single scoring engine
      const pts = calculateTeamPoints(r.placement, r.kills, config, mult);

      team.matchesPlayed += 1;
      team.totalKills += pts.kills;
      team.placementPoints += pts.placementPoints;
      team.killPoints += pts.killPoints;
      team.totalPoints += pts.totalPoints;
      if (pts.placement === 1) {
        team.booyahs += 1;
      }
      team.matchPlacements.push(pts.placement);
    });

    const leaderboard = Array.from(teamMap.values());

    // Deterministic Sorting
    leaderboard.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      if (b.totalKills !== a.totalKills) {
        return b.totalKills - a.totalKills;
      }
      if (b.placementPoints !== a.placementPoints) {
        return b.placementPoints - a.placementPoints;
      }
      if (b.booyahs !== a.booyahs) {
        return b.booyahs - a.booyahs;
      }
      return a.teamName.localeCompare(b.teamName);
    });

    // Assign final rank
    return leaderboard.map((row, index) => ({
      ...row,
      kills: row.totalKills,
      rank: index + 1,
    }));
  }

  // Public API
  return Object.freeze({
    DEFAULT_CONFIG: DEFAULT_FREE_FIRE_SCORING,
    normalizeConfig,
    calculateTeamPoints,
    validateMatchResults,
    calculateMatchLeaderboard,
    calculateTournamentLeaderboard,
  });
});
