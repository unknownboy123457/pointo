/* ====================================================================
   LRD PointCalc — Local Database Service (On-Device Storage)
   Architecture: All tournament/match data is strictly stored LOCALLY.
   Integrates directly with ScoringEngine for deterministic calculations.
   ==================================================================== */

(function (window) {
  'use strict';

  // Storage collection keys
  const KEYS = {
    TOURNAMENTS: 'lrd_local_tournaments',
    TEAMS: 'lrd_local_teams',
    PLAYERS: 'lrd_local_players',
    MATCHES: 'lrd_local_matches',
    RESULTS: 'lrd_local_match_results',
  };

  /**
   * Helper: Read a collection from local storage safely
   */
  function readCollection(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn(`LocalDatabase: Failed to read collection ${key}:`, e);
      return [];
    }
  }

  /**
   * Helper: Write a collection to local storage safely
   */
  function writeCollection(key, items) {
    try {
      localStorage.setItem(key, JSON.stringify(items));
      return true;
    } catch (e) {
      console.error(`LocalDatabase: Failed to write collection ${key}:`, e);
      return false;
    }
  }

  /**
   * Helper: Generate a unique local ID
   */
  function generateId(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // ==================================================================
  // LOCAL DATABASE SERVICE
  // ==================================================================
  const LocalDatabaseService = {
    // ----------------------------------------------------------------
    // TOURNAMENT CRUD (Filtered by owner_user_id)
    // ----------------------------------------------------------------

    /**
     * Get all tournaments owned by a specific user
     */
    getTournaments(ownerUserId) {
      if (!ownerUserId) return [];
      const all = readCollection(KEYS.TOURNAMENTS);
      return all
        .filter((t) => t.owner_user_id === ownerUserId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },

    /**
     * Get a specific tournament by ID, ensuring user ownership
     */
    getTournamentById(tournamentId, ownerUserId) {
      if (!tournamentId || !ownerUserId) return null;
      const all = readCollection(KEYS.TOURNAMENTS);
      return all.find((t) => t.id === tournamentId && t.owner_user_id === ownerUserId) || null;
    },

    /**
     * Create a new tournament locally for the authenticated owner
     * Saves tournament, exactly N separate teams, and optional player records.
     */
    createTournament(ownerUserId, { name, team_count, game_mode, scoring_system, scoring_config, teamsData }) {
      if (!ownerUserId || !name) return null;

      const teamCount = parseInt(team_count, 10) || 12;
      const now = new Date().toISOString();

      const newTournament = {
        id: generateId('tourn'),
        owner_user_id: ownerUserId,
        name: name.trim(),
        team_count: teamCount,
        game_mode: game_mode || 'squad',
        scoring_system: scoring_system || 'default',
        scoring_config: scoring_config || (scoring_system === 'custom' ? scoring_config : null),
        created_at: now,
        updated_at: now,
      };

      const allTournaments = readCollection(KEYS.TOURNAMENTS);
      allTournaments.unshift(newTournament);
      writeCollection(KEYS.TOURNAMENTS, allTournaments);

      // Create separate team records and optional player records
      const allTeams = readCollection(KEYS.TEAMS);
      const allPlayers = readCollection(KEYS.PLAYERS);

      if (Array.isArray(teamsData) && teamsData.length > 0) {
        teamsData.slice(0, teamCount).forEach((td, idx) => {
          const teamName = (td && td.name ? td.name.trim() : '') || `Team ${idx + 1}`;
          const teamId = generateId('team');
          const teamRecord = {
            id: teamId,
            tournament_id: newTournament.id,
            owner_user_id: ownerUserId,
            name: teamName,
            created_at: now,
            updated_at: now,
          };
          allTeams.push(teamRecord);

          // Optional players for this team
          if (Array.isArray(td.players)) {
            td.players.forEach((pName) => {
              if (pName && typeof pName === 'string' && pName.trim()) {
                allPlayers.push({
                  id: generateId('player'),
                  tournament_id: newTournament.id,
                  team_id: teamId,
                  owner_user_id: ownerUserId,
                  name: pName.trim(),
                  created_at: now,
                  updated_at: now,
                });
              }
            });
          }
        });

        // If fewer teams provided than teamCount, generate remaining default teams
        if (teamsData.length < teamCount) {
          for (let i = teamsData.length + 1; i <= teamCount; i++) {
            allTeams.push({
              id: generateId('team'),
              tournament_id: newTournament.id,
              owner_user_id: ownerUserId,
              name: `Team ${i}`,
              created_at: now,
              updated_at: now,
            });
          }
        }

        writeCollection(KEYS.TEAMS, allTeams);
        writeCollection(KEYS.PLAYERS, allPlayers);
      } else {
        // Fallback: provision default teams
        this.ensureDefaultTeams(newTournament.id, teamCount);
      }

      console.log('LocalDatabase: Created tournament locally:', newTournament.id, 'for owner:', ownerUserId, 'teams:', teamCount);
      return newTournament;
    },

    /**
     * Update an existing tournament
     */
    updateTournament(tournamentId, ownerUserId, updates) {
      if (!tournamentId || !ownerUserId) return null;

      const all = readCollection(KEYS.TOURNAMENTS);
      const index = all.findIndex((t) => t.id === tournamentId && t.owner_user_id === ownerUserId);
      if (index === -1) return null;

      all[index] = {
        ...all[index],
        ...updates,
        updated_at: new Date().toISOString(),
      };

      writeCollection(KEYS.TOURNAMENTS, all);
      return all[index];
    },

    /**
     * Delete tournament and CASCADE all local child records
     */
    deleteTournament(tournamentId, ownerUserId) {
      if (!tournamentId || !ownerUserId) return false;

      // 1. Verify ownership and remove tournament
      let tournaments = readCollection(KEYS.TOURNAMENTS);
      const exists = tournaments.some((t) => t.id === tournamentId && t.owner_user_id === ownerUserId);
      if (!exists) return false;

      tournaments = tournaments.filter((t) => !(t.id === tournamentId && t.owner_user_id === ownerUserId));
      writeCollection(KEYS.TOURNAMENTS, tournaments);

      // 2. Cascade delete teams & players
      const allTeams = readCollection(KEYS.TEAMS);
      const tournamentTeamIds = new Set(
        allTeams.filter((tm) => tm.tournament_id === tournamentId).map((tm) => tm.id)
      );
      const remainingTeams = allTeams.filter((tm) => tm.tournament_id !== tournamentId);
      writeCollection(KEYS.TEAMS, remainingTeams);

      const allPlayers = readCollection(KEYS.PLAYERS);
      const remainingPlayers = allPlayers.filter((p) => !tournamentTeamIds.has(p.team_id));
      writeCollection(KEYS.PLAYERS, remainingPlayers);

      // 3. Cascade delete matches & match results
      const allMatches = readCollection(KEYS.MATCHES);
      const tournamentMatchIds = new Set(
        allMatches.filter((m) => m.tournament_id === tournamentId).map((m) => m.id)
      );
      const remainingMatches = allMatches.filter((m) => m.tournament_id !== tournamentId);
      writeCollection(KEYS.MATCHES, remainingMatches);

      const allResults = readCollection(KEYS.RESULTS);
      const remainingResults = allResults.filter((r) => !tournamentMatchIds.has(r.match_id));
      writeCollection(KEYS.RESULTS, remainingResults);

      console.log('LocalDatabase: Permanently deleted tournament and all cascaded local data:', tournamentId);
      return true;
    },

    // ----------------------------------------------------------------
    // TEAMS & PLAYERS
    // ----------------------------------------------------------------
    getTeams(tournamentId) {
      if (!tournamentId) return [];
      return readCollection(KEYS.TEAMS).filter((tm) => tm.tournament_id === tournamentId);
    },

    getPlayers(teamId) {
      if (!teamId) return [];
      return readCollection(KEYS.PLAYERS).filter((p) => p.team_id === teamId);
    },

    getPlayersByTournament(tournamentId) {
      if (!tournamentId) return [];
      return readCollection(KEYS.PLAYERS).filter((p) => p.tournament_id === tournamentId);
    },

    getTeamsWithPlayers(tournamentId) {
      const teams = this.getTeams(tournamentId);
      const players = this.getPlayersByTournament(tournamentId);
      const playersByTeam = new Map();
      players.forEach((p) => {
        if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, []);
        playersByTeam.get(p.team_id).push(p);
      });
      return teams.map((t) => ({
        ...t,
        players: playersByTeam.get(t.id) || [],
      }));
    },

    ensureDefaultTeams(tournamentId, teamCount = 12) {
      const existing = this.getTeams(tournamentId);
      if (existing.length >= teamCount) return existing;

      const allTeams = readCollection(KEYS.TEAMS);
      const created = [];

      for (let i = existing.length + 1; i <= teamCount; i++) {
        const team = {
          id: generateId('team'),
          tournament_id: tournamentId,
          name: `Team ${i}`,
        };
        allTeams.push(team);
        created.push(team);
      }

      writeCollection(KEYS.TEAMS, allTeams);
      return this.getTeams(tournamentId);
    },

    updateTeamName(teamId, newName) {
      if (!teamId || !newName) return null;
      const all = readCollection(KEYS.TEAMS);
      const index = all.findIndex((t) => t.id === teamId);
      if (index === -1) return null;
      all[index].name = newName.trim();
      writeCollection(KEYS.TEAMS, all);
      return all[index];
    },

    // ----------------------------------------------------------------
    // MATCHES & RESULTS (Integrated with ScoringEngine)
    // ----------------------------------------------------------------
    getMatches(tournamentId) {
      if (!tournamentId) return [];
      return readCollection(KEYS.MATCHES)
        .filter((m) => m.tournament_id === tournamentId)
        .sort((a, b) => a.match_number - b.match_number);
    },

    getMatchById(matchId) {
      if (!matchId) return null;
      return readCollection(KEYS.MATCHES).find((m) => m.id === matchId) || null;
    },

    createMatch(tournamentId, matchNumber, matchName = '', multiplier = 1) {
      if (!tournamentId) return null;
      const num = matchNumber || (this.getMatches(tournamentId).length + 1);
      const mult = Number(multiplier) > 0 ? Number(multiplier) : 1;
      const newMatch = {
        id: generateId('match'),
        tournament_id: tournamentId,
        match_number: num,
        match_name: matchName || `Match ${num}`,
        multiplier: mult,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const all = readCollection(KEYS.MATCHES);
      all.push(newMatch);
      writeCollection(KEYS.MATCHES, all);
      return newMatch;
    },

    getMatchResults(matchId) {
      if (!matchId) return [];
      return readCollection(KEYS.RESULTS).filter((r) => r.match_id === matchId);
    },

    /**
     * Save/Edit all team results for a match using ScoringEngine as single source of truth
     *
     * @param {string} tournamentId
     * @param {string} matchId
     * @param {Array<{ teamId: string, placement: number, kills: number }>} entries
     * @param {Object} [scoringConfig]
     * @param {number} [multiplier=1]
     */
    saveMatchResults(tournamentId, matchId, entries, scoringConfig, multiplier = 1) {
      if (!matchId || !Array.isArray(entries)) return null;

      const mult = Number(multiplier) > 0 ? Number(multiplier) : 1;

      // Ensure match exists and mark completed
      const allMatches = readCollection(KEYS.MATCHES);
      const matchIndex = allMatches.findIndex((m) => m.id === matchId);
      if (matchIndex >= 0) {
        allMatches[matchIndex].status = 'completed';
        allMatches[matchIndex].multiplier = mult;
        allMatches[matchIndex].updated_at = new Date().toISOString();
        writeCollection(KEYS.MATCHES, allMatches);
      }

      // Read all existing results and remove old ones for this match
      let allResults = readCollection(KEYS.RESULTS).filter((r) => r.match_id !== matchId);

      const Engine = window.ScoringEngine || (typeof require !== 'undefined' ? require('./scoring-engine') : null);

      const savedResults = [];

      entries.forEach((entry) => {
        const teamId = entry.teamId;
        const place = Number(entry.placement) || 0;
        const kills = Math.max(0, Number(entry.kills) || 0);

        // Always compute using ScoringEngine with multiplier
        const pts = Engine
          ? Engine.calculateTeamPoints(place, kills, scoringConfig, mult)
          : { placementPoints: 0, killPoints: kills, multiplier: mult, totalPoints: Math.round(kills * mult) };

        const resultRecord = {
          id: generateId('res'),
          tournament_id: tournamentId,
          match_id: matchId,
          team_id: teamId,
          placement: pts.placement,
          kills: pts.kills,
          placement_points: pts.placementPoints,
          kill_points: pts.killPoints,
          multiplier: pts.multiplier,
          total_points: pts.totalPoints,
        };

        allResults.push(resultRecord);
        savedResults.push(resultRecord);
      });

      writeCollection(KEYS.RESULTS, allResults);
      console.log(`LocalDatabase: Saved results for match ${matchId} (${savedResults.length} teams, ${mult}x).`);
      return savedResults;
    },

    /**
     * Delete a match and its results from the local database
     */
    deleteMatch(matchId, tournamentId) {
      if (!matchId) return false;

      // 1. Remove match
      const allMatches = readCollection(KEYS.MATCHES).filter((m) => m.id !== matchId);
      writeCollection(KEYS.MATCHES, allMatches);

      // 2. Remove match results
      const allResults = readCollection(KEYS.RESULTS).filter((r) => r.match_id !== matchId);
      writeCollection(KEYS.RESULTS, allResults);

      console.log(`LocalDatabase: Permanently deleted match ${matchId} from local storage.`);
      return true;
    },

    // ----------------------------------------------------------------
    // LEADERBOARDS (Using ScoringEngine as Single Source of Truth)
    // ----------------------------------------------------------------

    /**
     * Calculate match leaderboard deterministically
     */
    getMatchLeaderboard(matchId, scoringConfig) {
      const results = this.getMatchResults(matchId);
      const match = this.getMatchById(matchId);
      const teams = readCollection(KEYS.TEAMS);
      const teamMap = new Map(teams.map((t) => [t.id, t.name]));

      const mult = match && match.multiplier ? match.multiplier : 1;

      const enriched = results.map((r) => ({
        ...r,
        teamName: teamMap.get(r.team_id) || `Team ${r.team_id.slice(-4)}`,
      }));

      const Engine = window.ScoringEngine || (typeof require !== 'undefined' ? require('./scoring-engine') : null);
      if (Engine && Engine.calculateMatchLeaderboard) {
        return Engine.calculateMatchLeaderboard(enriched, scoringConfig, mult);
      }
      return enriched;
    },

    /**
     * Calculate tournament overall leaderboard deterministically
     */
    getTournamentLeaderboard(tournamentId, scoringConfig) {
      const teams = this.getTeams(tournamentId);
      const matches = this.getMatches(tournamentId);
      const allResults = readCollection(KEYS.RESULTS);

      const Engine = window.ScoringEngine || (typeof require !== 'undefined' ? require('./scoring-engine') : null);
      if (Engine && Engine.calculateTournamentLeaderboard) {
        return Engine.calculateTournamentLeaderboard(teams, matches, allResults, scoringConfig);
      }

      return [];
    },
  };

  // Export to window
  window.LocalDatabaseService = LocalDatabaseService;
  window.TournamentService = LocalDatabaseService;
})(window);
