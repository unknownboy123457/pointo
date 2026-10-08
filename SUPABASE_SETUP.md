# LRD PointCalc — Final Architecture: Supabase Auth Only + Local Tournament Database

This document details the final architecture for **LRD PointCalc**, connecting your real Supabase project for **Google OAuth authentication** while keeping **all tournament data strictly local on the device**.

---

## 1. Architectural Roles

```text
               LRD POINTCALC
                     │
          ┌──────────┴──────────┐
          │                     │
     SUPABASE AUTH        LOCAL DATABASE
          │                     │
     Google Login          Tournaments
     User ID               Teams
     Email                 Players
     Name                  Matches
     Avatar                Results
                            Points & Leaderboard
```

- **SUPABASE (Cloud):**
  - Google Authentication via OAuth (`prompt=select_account`)
  - User Identity (`user.id`, `user.email`, `full_name`, `avatar_url`)
  - Display on the Account screen
  - Future Premium / subscription entitlement checks
  - **Zero tournament data is sent or stored in Supabase.**

- **LOCAL DATABASE (On-Device):**
  - Persistent local storage on the user's device (`scripts/local-db.js`)
  - Tournaments (`id`, `owner_user_id`, `name`, `team_count`, `game_mode`, `scoring_system`, `created_at`, `updated_at`)
  - Teams (`id`, `tournament_id`, `name`)
  - Players (`id`, `team_id`, `name`)
  - Matches (`id`, `tournament_id`, `match_number`, `status`)
  - Match Results (`id`, `match_id`, `team_id`, `placement`, `kills`, `placement_points`, `kill_points`, `total_points`)
  - Strictly partitioned and filtered by `owner_user_id`.

---

## 2. Configured Credentials

The application is configured with your real Supabase project credentials in [scripts/config.js](file:///c:/Users/hp/WEB%20RELEATED%20Q/pointcalc%20app/scripts/config.js):

- **Project URL:** `https://rxunwauuaxymnljytato.supabase.co`
- **Publishable Key:** `sb_publishable_fY-JwLT0sIJu_bCMKofvrQ_niVcMvAk`

---

## 3. Google OAuth Setup (Supabase & Google Cloud)

To allow users to sign in with their real Gmail accounts:

### A. Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/) > **APIs & Services** > **Credentials**.
2. Create or open an **OAuth 2.0 Web Client**.
3. Under **Authorized redirect URIs**, add your Supabase Auth callback URI:
   ```text
   https://rxunwauuaxymnljytato.supabase.co/auth/v1/callback
   ```
4. Copy the **Client ID** and **Client Secret**.

### B. Supabase Dashboard
1. Open your project dashboard at [https://rxunwauuaxymnljytato.supabase.co](https://supabase.com/dashboard/project/rxunwauuaxymnljytato).
2. Go to **Authentication** > **Providers** > **Google**.
3. Toggle **Enable Google provider** to ON.
4. Paste the **Client ID** and **Client Secret** from Google Cloud Console.
5. In **Authentication** > **URL Configuration**:
   - Set **Site URL** to your local dev URL or live URL (e.g. `http://localhost:5500`).
   - Add wildcard redirect URLs:
     - `http://localhost:5500/**`
     - `http://127.0.0.1:5500/**`
     - `https://your-domain.com/**`
6. Click **Save**.

---

## 4. Local User Isolation & Persistence Verification

| Step | Action | Expected Behavior |
| :--- | :--- | :--- |
| **1** | Open LRD PointCalc | Splash screen verifies Supabase session. If unauthenticated, displays Login screen. |
| **2** | Tap **Continue with Google** | Google account selector (`prompt=select_account`) opens. |
| **3** | Authenticate with Gmail | Returns to Home. Account screen shows real Google profile photo, name, and Gmail address. |
| **4** | Tap **+ Create Tournament** | Tournament is saved **strictly to the local database** with `owner_user_id = user.id`. Nothing is sent to Supabase. |
| **5** | Close and reopen the app | Tournament is still visible. |
| **6** | Restart device | Tournament is still visible. |
| **7** | Tap **Sign Out** & confirm | User is signed out of Supabase. **Local tournament data is preserved.** |
| **8** | Log back in with the **same** Gmail | All existing local tournaments reappear for this user. |
| **9** | Log in with a **different** Gmail | First user's tournaments are **not visible** (filtered by `owner_user_id`). |
| **10** | Tap trash icon on tournament card | Confirmation modal appears: *"Delete this tournament? This will permanently delete the tournament, teams, matches and results from this device."* |
| **11** | Tap **Delete** | Tournament and all child records are permanently removed from the local device. |
| **12** | Check Supabase Dashboard | Supabase contains **no** tournament records, only authenticated user identity in Supabase Auth. |
