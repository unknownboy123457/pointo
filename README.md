# LRD PointCalc — Native Android & Kotlin Architecture Specification

> **Full system specification, domain models, algorithms, and Jetpack Compose UI architecture implemented in Kotlin for LRD PointCalc (Pointo).**

This document provides a complete, production-grade Kotlin implementation guide for the Free Fire Esports Point Calculator and AI Match Scanner, strictly upholding the **12 Lobby Slots + 12 Result Slots** architecture, official Free Fire scoring rules, and deterministic roster matching.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Domain Models (Kotlin)](#2-domain-models-kotlin)
3. [Official Free Fire Scoring Engine](#3-official-free-fire-scoring-engine)
4. [12 Lobby Slots Roster Manager](#4-12-lobby-slots-roster-manager)
5. [End Results & Kill Aggregation Engine](#5-end-results--kill-aggregation-engine)
6. [Lobby Matching & Unassigned Player Routing](#6-lobby-matching--unassigned-player-routing)
7. [AI OCR Extraction & Gemini Vision Service](#7-ai-ocr-extraction--gemini-vision-service)
8. [Local Persistence (Room Database & DAOs)](#8-local-persistence-room-database--daos)
9. [Jetpack Compose UI & State Management](#9-jetpack-compose-ui--state-management)
10. [Unit & Acceptance Tests in Kotlin](#10-unit--acceptance-tests-in-kotlin)
11. [Gradle Configuration (`build.gradle.kts`)](#11-gradle-configuration-buildgradlekts)

---

## 1. Architecture Overview

LRD PointCalc follows modern Android architecture (MVVM + Clean Architecture) with reactive Unidirectional Data Flow (UDF) powered by Kotlin Coroutines and StateFlow:

```
┌─────────────────────────────────────────────────────────┐
│              Jetpack Compose UI Layer                   │
│  (12-Slot Lobby Cards, 12-Slot Result Cards, Standings) │
└──────────────────────────▲──────────────────────────────┘
                           │ StateFlow<ScannerUiState>
┌──────────────────────────┴──────────────────────────────┐
│                    ScannerViewModel                     │
│  - User Inputs & Overrides                              │
│  - Live Re-calculation Dispatch                         │
└────────────▲───────────────────────────────▲────────────┘
             │                               │
┌────────────┴───────────────┐ ┌─────────────┴────────────┐
│    SlotMatchingEngine      │ │      ScoringEngine       │
│  - Fuzzy Roster Matching   │ │  - 12-9-8-7-6-5-4-3-2-1  │
│  - Kill Summation (8 pts)  │ │  - Kill Points (1 pt/ea) │
│  - Dropdown Assignments    │ │  - Multipliers & Ties    │
└────────────▲───────────────┘ └──────────────────────────┘
             │
┌────────────┴────────────────────────────────────────────┐
│                  GeminiOcrService                       │
│  - Multi-image classification (Slot List vs End Result) │
│  - Structured JSON extraction from game screenshots     │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Domain Models (Kotlin)

```kotlin
package com.pointcalc.domain.model

import java.util.UUID

/**
 * Single player inside a lobby slot
 */
data class LobbyPlayer(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val slotNumber: Int, // 1 to 12
    val confidence: Float = 1.0f,
    val isManual: Boolean = false
)

/**
 * Exactly 12 Lobby Slots (Slot 1 to Slot 12)
 */
data class LobbySlot(
    val slotNumber: Int, // 1..12
    val teamName: String,
    val players: List<LobbyPlayer> = emptyList(),
    val isVerified: Boolean = false
)

/**
 * Individual player kill record extracted from end screens
 */
data class PlayerKillRecord(
    val id: String = UUID.randomUUID().toString(),
    val playerName: String,
    val kills: Int = 0,
    val slotNumber: Int? = null,
    val confidence: Float = 1.0f,
    val isManual: Boolean = false
)

/**
 * Exactly 12 End Result Slots (Slot 1 to Slot 12)
 */
data class ResultSlot(
    val slotNumber: Int, // 1..12
    val teamName: String,
    val placement: Int = slotNumber, // 1..12
    val players: List<PlayerKillRecord> = emptyList(),
    val isManualOverride: Boolean = false,
    val manualKillsOverride: Int? = null
) {
    /**
     * Total kills strictly equals the sum of individual player kills
     * (e.g. 5 + 2 + 1 + 0 = 8 kills) unless manually overridden.
     */
    val totalKills: Int
        get() = if (isManualOverride && manualKillsOverride != null) {
            manualKillsOverride
        } else {
            players.sumOf { it.kills }
        }
}

/**
 * Unassigned player detected in end screenshot that could not
 * be matched automatically to the lobby roster.
 */
data class UnassignedPlayer(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val kills: Int,
    val assignedSlot: Int? = null, // Selected via Slot 1..12 dropdown
    val sourceScreenshot: String = ""
)

/**
 * Match standing summary row
 */
data class TeamStandingRow(
    val rank: Int,
    val slotNumber: Int,
    val teamName: String,
    val placement: Int,
    val placePoints: Int,
    val killPoints: Int,
    val totalPoints: Int,
    val isBooyah: Boolean
)
```

---

## 3. Official Free Fire Scoring Engine

Official Free Fire tournament points rule:
- **1st (Booyah):** 12 pts
- **2nd:** 9 pts
- **3rd:** 8 pts
- **4th:** 7 pts
- **5th:** 6 pts
- **6th:** 5 pts
- **7th:** 4 pts
- **8th:** 3 pts
- **9th:** 2 pts
- **10th:** 1 pt
- **11th & 12th:** 0 pts
- **Kill points:** 1 point per kill

```kotlin
package com.pointcalc.domain.scoring

import com.pointcalc.domain.model.ResultSlot
import com.pointcalc.domain.model.TeamStandingRow

object ScoringEngine {

    // Official placement point table (1-indexed for placements 1..12)
    private val PLACEMENT_POINTS = mapOf(
        1 to 12,
        2 to 9,
        3 to 8,
        4 to 7,
        5 to 6,
        6 to 5,
        7 to 4,
        8 to 3,
        9 to 2,
        10 to 1,
        11 to 0,
        12 to 0
    )

    fun getPlacementPoints(placement: Int): Int {
        return PLACEMENT_POINTS[placement] ?: 0
    }

    /**
     * Calculates standings for all 12 result slots
     */
    fun calculateStandings(
        slots: List<ResultSlot>,
        multiplier: Double = 1.0
    ): List<TeamStandingRow> {
        require(slots.size == 12) { "Must provide exactly 12 result slots" }

        val rows = slots.map { slot ->
            val placePts = getPlacementPoints(slot.placement)
            val killPts = slot.totalKills
            val rawTotal = placePts + killPts
            val finalTotal = (rawTotal * multiplier).toInt()

            TeamStandingRow(
                rank = 0, // Assigned after sorting
                slotNumber = slot.slotNumber,
                teamName = slot.teamName,
                placement = slot.placement,
                placePoints = placePts,
                killPoints = killPts,
                totalPoints = finalTotal,
                isBooyah = slot.placement == 1
            )
        }

        // Tie-breaker rules:
        // 1. Total Points (Desc)
        // 2. Kill Points (Desc)
        // 3. Placement (Asc: lower rank number is better)
        val sorted = rows.sortedWith(
            compareByDescending<TeamStandingRow> { it.totalPoints }
                .thenByDescending { it.killPoints }
                .thenBy { it.placement }
        )

        return sorted.mapIndexed { index, row ->
            row.copy(rank = index + 1)
        }
    }
}
```

---

## 4. 12 Lobby Slots Roster Manager

Manages exactly 12 lobby slot sections, allowing player CRUD operations per slot.

```kotlin
package com.pointcalc.domain.manager

import com.pointcalc.domain.model.LobbyPlayer
import com.pointcalc.domain.model.LobbySlot

class LobbyRosterManager {

    private val _slots = MutableList(12) { index ->
        val slotNum = index + 1
        LobbySlot(
            slotNumber = slotNum,
            teamName = "Slot $slotNum",
            players = emptyList()
        )
    }

    val slots: List<LobbySlot>
        get() = _slots.toList()

    /**
     * Initializes or resets roster to exactly 12 slots
     */
    fun initialize12Slots(teamNames: List<String>? = null) {
        _slots.clear()
        for (i in 1..12) {
            val name = teamNames?.getOrNull(i - 1) ?: "Slot $i"
            _slots.add(LobbySlot(slotNumber = i, teamName = name, players = emptyList()))
        }
    }

    /**
     * Updates the team name of a specific slot (1..12)
     */
    fun updateTeamName(slotNumber: Int, newName: String) {
        require(slotNumber in 1..12) { "Invalid slot number $slotNumber" }
        val idx = slotNumber - 1
        _slots[idx] = _slots[idx].copy(teamName = newName.trim())
    }

    /**
     * Replaces players for a slot (used after OCR extraction to clean dummy placeholders)
     */
    fun setSlotPlayers(slotNumber: Int, playerNames: List<String>) {
        require(slotNumber in 1..12) { "Invalid slot number $slotNumber" }
        val idx = slotNumber - 1
        val players = playerNames.filter { it.isNotBlank() }.map { name ->
            LobbyPlayer(name = name.trim(), slotNumber = slotNumber)
        }
        _slots[idx] = _slots[idx].copy(players = players, isVerified = true)
    }

    /**
     * Adds a single player to a slot manually
     */
    fun addPlayer(slotNumber: Int, playerName: String): LobbyPlayer {
        require(slotNumber in 1..12) { "Invalid slot number $slotNumber" }
        val idx = slotNumber - 1
        val player = LobbyPlayer(name = playerName.trim(), slotNumber = slotNumber, isManual = true)
        _slots[idx] = _slots[idx].copy(players = _slots[idx].players + player)
        return player
    }

    /**
     * Updates a player's name directly in a slot
     */
    fun updatePlayerName(slotNumber: Int, playerId: String, newName: String) {
        require(slotNumber in 1..12) { "Invalid slot number $slotNumber" }
        val idx = slotNumber - 1
        val updated = _slots[idx].players.map { p ->
            if (p.id == playerId) p.copy(name = newName.trim(), isManual = true) else p
        }
        _slots[idx] = _slots[idx].copy(players = updated)
    }

    /**
     * Removes a player from a slot
     */
    fun removePlayer(slotNumber: Int, playerId: String) {
        require(slotNumber in 1..12) { "Invalid slot number $slotNumber" }
        val idx = slotNumber - 1
        val updated = _slots[idx].players.filterNot { it.id == playerId }
        _slots[idx] = _slots[idx].copy(players = updated)
    }

    /**
     * Check if a usable lobby roster is loaded (has at least 1 real player)
     */
    fun hasUsableRoster(): Boolean {
        return _slots.any { it.players.isNotEmpty() }
    }
}
```

---

## 5. End Results & Kill Aggregation Engine

Maintains exactly 12 result slots, calculates dynamic kill totals (`5 + 2 + 1 + 0 = 8`), and handles placements.

```kotlin
package com.pointcalc.domain.manager

import com.pointcalc.domain.model.PlayerKillRecord
import com.pointcalc.domain.model.ResultSlot

class ResultSlotManager {

    private val _slots = MutableList(12) { index ->
        val slotNum = index + 1
        ResultSlot(
            slotNumber = slotNum,
            teamName = "Slot $slotNum",
            placement = slotNum,
            players = emptyList()
        )
    }

    val slots: List<ResultSlot>
        get() = _slots.toList()

    /**
     * Synchronizes result slots from the lobby slots
     */
    fun syncWithLobbyRoster(lobbySlots: List<com.pointcalc.domain.model.LobbySlot>) {
        require(lobbySlots.size == 12)
        for (i in 0 until 12) {
            val lobby = lobbySlots[i]
            val existing = _slots[i]
            _slots[i] = existing.copy(teamName = lobby.teamName)
        }
    }

    /**
     * Updates placement (#1 to #12) directly inside the result slot
     */
    fun updatePlacement(slotNumber: Int, placement: Int) {
        require(slotNumber in 1..12) { "Invalid slot number $slotNumber" }
        require(placement in 1..12) { "Placement must be 1 to 12" }
        val idx = slotNumber - 1
        _slots[idx] = _slots[idx].copy(placement = placement)
    }

    /**
     * Updates an individual player's kill count directly
     * Total kills for the slot will dynamically update: sumOf { it.kills }
     */
    fun updatePlayerKill(slotNumber: Int, playerId: String, kills: Int) {
        require(slotNumber in 1..12) { "Invalid slot number $slotNumber" }
        val safeKills = kills.coerceAtLeast(0)
        val idx = slotNumber - 1
        val updatedPlayers = _slots[idx].players.map { p ->
            if (p.id == playerId) p.copy(kills = safeKills, isManual = true) else p
        }
        _slots[idx] = _slots[idx].copy(
            players = updatedPlayers,
            isManualOverride = false,
            manualKillsOverride = null
        )
    }

    /**
     * Directly assign players and kills to a result slot
     */
    fun setResultPlayers(slotNumber: Int, players: List<PlayerKillRecord>) {
        require(slotNumber in 1..12) { "Invalid slot number $slotNumber" }
        val idx = slotNumber - 1
        _slots[idx] = _slots[idx].copy(players = players)
    }
}
```

---

## 6. Lobby Matching & Unassigned Player Routing

### The Core Matching Rule
> **"The lobby roster determines which slot a player belongs to. The end screenshots determine that player's kills and the team's placement, when visible."**
> Kills are routed strictly by roster membership, **never by OCR line order**.

```kotlin
package com.pointcalc.domain.matching

import com.pointcalc.domain.model.LobbySlot
import com.pointcalc.domain.model.PlayerKillRecord
import com.pointcalc.domain.model.ResultSlot
import com.pointcalc.domain.model.UnassignedPlayer

class SlotMatchingEngine {

    // Preserved manual overrides (Player Name -> Assigned Slot 1..12)
    private val confirmedManualAssignments = mutableMapOf<String, Int>()

    /**
     * Normalizes names for robust fuzzy matching:
     * - Preserves dots, underscores, hyphens, and exclamation marks (e.g. "LRD.V!PER_07")
     * - Case-insensitive trimmed comparison
     */
    fun normalizePlayerName(name: String): String {
        return name.trim().lowercase().replace(Regex("[^a-z0-9._!\\-]"), "")
    }

    /**
     * Matches raw extracted kills against the confirmed lobby roster
     */
    fun routeKillsToSlots(
        lobbySlots: List<LobbySlot>,
        rawExtractedKills: List<PlayerKillRecord>
    ): MatchingResult {
        require(lobbySlots.size == 12) { "Must have exactly 12 lobby slots" }

        // Build lookup map: Normalized Player Name -> Slot Number (1..12)
        val playerToSlotMap = mutableMapOf<String, Int>()
        lobbySlots.forEach { slot ->
            slot.players.forEach { player ->
                playerToSlotMap[normalizePlayerName(player.name)] = slot.slotNumber
            }
        }

        // Apply any previously confirmed manual assignments
        confirmedManualAssignments.forEach { (name, slotNum) ->
            playerToSlotMap[normalizePlayerName(name)] = slotNum
        }

        val slotAssignedPlayers = MutableList(12) { mutableListOf<PlayerKillRecord>() }
        val unassignedList = mutableListOf<UnassignedPlayer>()

        rawExtractedKills.forEach { killRecord ->
            val normName = normalizePlayerName(killRecord.playerName)
            val matchedSlot = playerToSlotMap[normName]

            if (matchedSlot != null && matchedSlot in 1..12) {
                // Route directly into the lobby-determined slot
                slotAssignedPlayers[matchedSlot - 1].add(
                    killRecord.copy(slotNumber = matchedSlot)
                )
            } else {
                // Cannot be matched automatically -> isolate for manual Slot 1..12 dropdown assignment
                unassignedList.add(
                    UnassignedPlayer(
                        name = killRecord.playerName,
                        kills = killRecord.kills
                    )
                )
            }
        }

        val resultSlots = (1..12).map { slotNum ->
            val lobby = lobbySlots[slotNum - 1]
            ResultSlot(
                slotNumber = slotNum,
                teamName = lobby.teamName,
                placement = slotNum,
                players = slotAssignedPlayers[slotNum - 1]
            )
        }

        return MatchingResult(
            resultSlots = resultSlots,
            unassignedPlayers = unassignedList
        )
    }

    /**
     * Assigns an unassigned player to a slot via the UI dropdown (Slot 1..12).
     * Saves the assignment persistently so subsequent recalculations remember it.
     */
    fun assignUnassignedPlayerManually(
        player: UnassignedPlayer,
        targetSlot: Int,
        currentSlots: List<ResultSlot>
    ): List<ResultSlot> {
        require(targetSlot in 1..12) { "Target slot must be 1 to 12" }

        // Save persistently
        confirmedManualAssignments[player.name] = targetSlot

        val updatedSlots = currentSlots.toMutableList()
        val idx = targetSlot - 1
        val target = updatedSlots[idx]

        val newRecord = PlayerKillRecord(
            playerName = player.name,
            kills = player.kills,
            slotNumber = targetSlot,
            isManual = true
        )

        // Add player and dynamically update slot total kills
        updatedSlots[idx] = target.copy(
            players = target.players + newRecord
        )

        return updatedSlots
    }
}

data class MatchingResult(
    val resultSlots: List<ResultSlot>,
    val unassignedPlayers: List<UnassignedPlayer>
)
```

---

## 7. AI OCR Extraction & Gemini Vision Service

Processes uploaded screenshots using Google's **Gemini 1.5 Flash Vision API** with structured JSON output schemas:

```kotlin
package com.pointcalc.data.ai

import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.content
import android.graphics.Bitmap
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class OcrLobbyResponse(
    val slots: List<OcrLobbySlot> = emptyList()
)

@Serializable
data class OcrLobbySlot(
    val slotNumber: Int,
    val teamName: String? = null,
    val players: List<String> = emptyList()
)

@Serializable
data class OcrResultResponse(
    val results: List<OcrPlayerResult> = emptyList()
)

@Serializable
data class OcrPlayerResult(
    val playerName: String,
    val kills: Int,
    val rank: Int? = null
)

class GeminiOcrService(private val apiKey: String) {

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    private val visionModel = GenerativeModel(
        modelName = "gemini-1.5-flash",
        apiKey = apiKey
    )

    /**
     * Extracts exactly 12 lobby slot groupings from a lobby slot list screenshot
     */
    suspend fun extractLobbyRoster(bitmap: Bitmap): OcrLobbyResponse {
        val prompt = """
            Extract the Free Fire esports lobby roster from this screenshot.
            Organize the players strictly into slots 1 to 12 based on visible slot labels.
            Output ONLY valid JSON matching this schema:
            {
              "slots": [
                { "slotNumber": 1, "teamName": "TEAM NAME", "players": ["Player1", "Player2", "Player3", "Player4"] }
              ]
            }
        """.trimIndent()

        val response = visionModel.generateContent(
            content {
                image(bitmap)
                text(prompt)
            }
        )

        val cleanJson = response.text?.replace(Regex("```json|```"), "")?.trim() ?: "{}"
        return json.decodeFromString(cleanJson)
    }

    /**
     * Extracts player names, kills, and team ranks from match end screenshots
     */
    suspend fun extractMatchResults(bitmap: Bitmap): OcrResultResponse {
        val prompt = """
            Extract all player names, individual kill counts (eliminations), and team placements from this match end result screenshot.
            Output ONLY valid JSON matching this schema:
            {
              "results": [
                { "playerName": "ExactName", "kills": 5, "rank": 1 }
              ]
            }
        """.trimIndent()

        val response = visionModel.generateContent(
            content {
                image(bitmap)
                text(prompt)
            }
        )

        val cleanJson = response.text?.replace(Regex("```json|```"), "")?.trim() ?: "{}"
        return json.decodeFromString(cleanJson)
    }
}
```

---

## 8. Local Persistence (Room Database & DAOs)

All tournament and slot-list data is persisted strictly on the device using Android Room.

```kotlin
package com.pointcalc.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "saved_slot_lists")
data class SavedSlotListEntity(
    @PrimaryKey val id: String,
    val name: String,
    val slotDataJson: String, // Serialized List<LobbySlot>
    val createdAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "tournaments")
data class TournamentEntity(
    @PrimaryKey val id: String,
    val title: String,
    val teamCount: Int = 12,
    val createdAt: Long = System.currentTimeMillis()
)

@Dao
interface PointCalcDao {
    @Query("SELECT * FROM saved_slot_lists ORDER BY createdAt DESC")
    fun getAllSavedSlotLists(): Flow<List<SavedSlotListEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSlotList(slotList: SavedSlotListEntity)

    @Query("DELETE FROM saved_slot_lists WHERE id = :id")
    suspend fun deleteSlotList(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTournament(tournament: TournamentEntity)
}
```

---

## 9. Jetpack Compose UI & State Management

### Theme Colors (Deep Purple Aesthetic)
```kotlin
package com.pointcalc.ui.theme

import androidx.compose.ui.graphics.Color

val BgDark = Color(0xFF0C0B14)
val SurfaceDark = Color(0xFF161324)
val SurfaceCard = Color(0xFF1E1A33)
val BorderPurple = Color(0xFF382F5E)
val PrimaryPurple = Color(0xFF8B5CF6)
val AccentPurple = Color(0xFFA855F7)
val TextPrimary = Color(0xFFF3F0FF)
val TextMuted = Color(0xFF9E95BD)
val GoldBooyah = Color(0xFFFFD700)
```

### 12 Lobby Slot Card Component
```kotlin
package com.pointcalc.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pointcalc.domain.model.LobbySlot
import com.pointcalc.ui.theme.*

@Composable
fun LobbySlotCard(
    slot: LobbySlot,
    onTeamNameChange: (String) -> Unit,
    onPlayerNameChange: (playerId: String, newName: String) -> Unit,
    onAddPlayer: () -> Unit,
    onDeletePlayer: (playerId: String) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .border(1.dp, BorderPurple, RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            // Slot Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "SLOT ${slot.slotNumber}",
                    style = MaterialTheme.typography.titleMedium,
                    color = PrimaryPurple
                )
                OutlinedTextField(
                    value = slot.teamName,
                    onValueChange = onTeamNameChange,
                    modifier = Modifier.width(180.dp),
                    label = { Text("Team Name", color = TextMuted) },
                    singleLine = true
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Players List
            slot.players.forEachIndexed { idx, player ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "P${idx + 1}",
                        color = TextMuted,
                        modifier = Modifier.width(28.dp)
                    )
                    OutlinedTextField(
                        value = player.name,
                        onValueChange = { onPlayerNameChange(player.id, it) },
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    IconButton(onClick = { onDeletePlayer(player.id) }) {
                        Icon(Icons.Default.Close, contentDescription = "Delete", tint = Color.Red)
                    }
                }
            }

            // Add Player Button
            TextButton(
                onClick = onAddPlayer,
                modifier = Modifier.align(Alignment.End)
            ) {
                Icon(Icons.Default.Add, contentDescription = null, tint = PrimaryPurple)
                Spacer(modifier = Modifier.width(4.dp))
                Text("+ Add Player", color = PrimaryPurple)
            }
        }
    }
}
```

### 12 Result Slot Card Component
```kotlin
package com.pointcalc.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.pointcalc.domain.model.ResultSlot
import com.pointcalc.ui.theme.*

@Composable
fun ResultSlotCard(
    slot: ResultSlot,
    onPlacementChange: (Int) -> Unit,
    onPlayerKillChange: (playerId: String, newKills: Int) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .border(1.dp, BorderPurple, RoundedCornerShape(12.dp)),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            // Header: Slot + Placement + Total Kills Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("SLOT ${slot.slotNumber}", color = PrimaryPurple, style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(slot.teamName, color = TextPrimary, style = MaterialTheme.typography.bodyMedium)
                }

                // Dynamic Total Kills Pill Badge
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = AccentPurple.copy(alpha = 0.2f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, AccentPurple)
                ) {
                    Text(
                        text = "${slot.totalKills} Kills",
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelMedium
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Placement Input
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Placement: #", color = TextMuted)
                OutlinedTextField(
                    value = slot.placement.toString(),
                    onValueChange = { it.toIntOrNull()?.let(onPlacementChange) },
                    modifier = Modifier.width(70.dp),
                    singleLine = true
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Player Kills with - / + Stepper
            slot.players.forEach { player ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(player.playerName, color = TextPrimary, modifier = Modifier.weight(1f))

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        FilledTonalButton(
                            onClick = { onPlayerKillChange(player.id, player.kills - 1) },
                            enabled = player.kills > 0,
                            modifier = Modifier.size(32.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("-")
                        }

                        Text(
                            text = "${player.kills}",
                            color = TextPrimary,
                            modifier = Modifier.padding(horizontal = 12.dp)
                        )

                        FilledTonalButton(
                            onClick = { onPlayerKillChange(player.id, player.kills + 1) },
                            modifier = Modifier.size(32.dp),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("+")
                        }
                    }
                }
            }
        }
    }
}
```

---

## 10. Unit & Acceptance Tests in Kotlin

Complete unit tests covering all rules requested by the specification:

```kotlin
package com.pointcalc.test

import com.pointcalc.domain.manager.LobbyRosterManager
import com.pointcalc.domain.matching.SlotMatchingEngine
import com.pointcalc.domain.model.PlayerKillRecord
import com.pointcalc.domain.model.ResultSlot
import com.pointcalc.domain.scoring.ScoringEngine
import org.junit.Assert.*
import org.junit.Test

class PointCalcArchitectureTest {

    @Test
    fun testExactly12LobbySlotsMaintained() {
        val manager = LobbyRosterManager()
        manager.initialize12Slots()

        assertEquals("Must have exactly 12 lobby slots", 12, manager.slots.size)
        assertEquals(1, manager.slots.first().slotNumber)
        assertEquals(12, manager.slots.last().slotNumber)
    }

    @Test
    fun testIndividualKillAggregationSummation() {
        // If Slot 5's players have 5, 2, 1, and 0 kills, Slot 5's total is 8 kills.
        val players = listOf(
            PlayerKillRecord(playerName = "P1", kills = 5),
            PlayerKillRecord(playerName = "P2", kills = 2),
            PlayerKillRecord(playerName = "P3", kills = 1),
            PlayerKillRecord(playerName = "P4", kills = 0)
        )

        val slot5 = ResultSlot(
            slotNumber = 5,
            teamName = "Slot 5",
            placement = 2,
            players = players
        )

        assertEquals("Total kills must equal 5 + 2 + 1 + 0 = 8", 8, slot5.totalKills)
    }

    @Test
    fun testMatchingRuleLobbyDeterminesSlotNotOcrOrder() {
        val rosterManager = LobbyRosterManager()
        rosterManager.initialize12Slots()
        rosterManager.setSlotPlayers(3, listOf("PlayerAlpha", "PlayerBeta"))
        rosterManager.setSlotPlayers(7, listOf("PlayerGamma"))

        // End screen OCR extracted in random order
        val endScreenKills = listOf(
            PlayerKillRecord(playerName = "PlayerGamma", kills = 4),
            PlayerKillRecord(playerName = "PlayerAlpha", kills = 3)
        )

        val matchingEngine = SlotMatchingEngine()
        val result = matchingEngine.routeKillsToSlots(rosterManager.slots, endScreenKills)

        val slot3 = result.resultSlots.first { it.slotNumber == 3 }
        val slot7 = result.resultSlots.first { it.slotNumber == 7 }

        assertEquals(1, slot3.players.size)
        assertEquals("PlayerAlpha", slot3.players[0].playerName)
        assertEquals(3, slot3.totalKills)

        assertEquals(1, slot7.players.size)
        assertEquals("PlayerGamma", slot7.players[0].playerName)
        assertEquals(4, slot7.totalKills)
    }

    @Test
    fun testOfficialFreeFireScoringEngine() {
        val slots = (1..12).map { slotNum ->
            ResultSlot(
                slotNumber = slotNum,
                teamName = "Team $slotNum",
                placement = slotNum,
                players = listOf(PlayerKillRecord(playerName = "P", kills = if (slotNum == 1) 10 else 2))
            )
        }

        val standings = ScoringEngine.calculateStandings(slots)

        // 1st place: 12 placement points + 10 kills = 22 total points
        val first = standings.first { it.placement == 1 }
        assertEquals(1, first.rank)
        assertEquals(12, first.placePoints)
        assertEquals(10, first.killPoints)
        assertEquals(22, first.totalPoints)
        assertTrue(first.isBooyah)

        // 11th & 12th place: 0 placement points
        val eleventh = standings.first { it.placement == 11 }
        assertEquals(0, eleventh.placePoints)
    }
}
```

---

## 11. Gradle Configuration (`build.gradle.kts`)

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.pointcalc"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pointcalc"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Jetpack Compose & Material 3
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)

    // Kotlin Coroutines & Serialization
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    // Room Database
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // Google Gemini Generative AI SDK
    implementation(libs.google.generativeai)

    // Unit Testing
    testImplementation(libs.junit)
}
```

---

## License

LRD PointCalc is licensed under the MIT License.