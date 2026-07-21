# Graph Report - .  (2026-07-21)

## Corpus Check
- Corpus is ~12,306 words - fits in a single context window. You may not need a graph.

## Summary
- 86 nodes · 83 edges · 20 communities (7 shown, 13 thin omitted)
- Extraction: 78% EXTRACTED · 22% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.87)
- Token cost: 15,000 input · 3,500 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Server Core Infrastructure|Server Core Infrastructure]]
- [[_COMMUNITY_Player Display System|Player Display System]]
- [[_COMMUNITY_Package Metadata|Package Metadata]]
- [[_COMMUNITY_Playlist & Broadcasting|Playlist & Broadcasting]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_Database & AI Moderation|Database & AI Moderation]]
- [[_COMMUNITY_NPM Scripts|NPM Scripts]]
- [[_COMMUNITY_Admin Ad Management|Admin Ad Management]]
- [[_COMMUNITY_Admin Booking Management|Admin Booking Management]]
- [[_COMMUNITY_File Upload & Moderation|File Upload & Moderation]]
- [[_COMMUNITY_Payment Processing|Payment Processing]]
- [[_COMMUNITY_Documentation|Documentation]]
- [[_COMMUNITY_Project Identity|Project Identity]]
- [[_COMMUNITY_Setup Script|Setup Script]]
- [[_COMMUNITY_Express & Multer Config|Express & Multer Config]]
- [[_COMMUNITY_Screen Management|Screen Management]]
- [[_COMMUNITY_Admin Stats|Admin Stats]]
- [[_COMMUNITY_Pricing Engine|Pricing Engine]]
- [[_COMMUNITY_Location Services|Location Services]]
- [[_COMMUNITY_Dynamic Pricing Concept|Dynamic Pricing Concept]]

## God Nodes (most connected - your core abstractions)
1. `getPlaylistForScreen()` - 6 edges
2. `scripts` - 5 edges
3. `getDatabase()` - 4 edges
4. `saveDatabase()` - 4 edges
5. `sendPlaylistToScreen()` - 4 edges
6. `runAIModeration()` - 4 edges
7. `updatePlaylist` - 4 edges
8. `broadcastToScreens()` - 3 edges
9. `connectWebSocket` - 3 edges
10. `startHttpPolling` - 3 edges

## Surprising Connections (you probably didn't know these)
- `WebSocket Real-Time Sync` --semantically_similar_to--> `HTTP Polling Fallback`  [INFERRED] [semantically similar]
  server/server.js → player/player.html
- `connectWebSocket` --implements--> `WebSocket Real-Time Sync`  [INFERRED]
  player/player.html → server/server.js
- `loadPlayer` --calls--> `fetchPlaylist`  [INFERRED]
  admin/admin.html → player/player.html
- `DOOH Platform Setup Script` --references--> `dooh-multi-screen-platform`  [EXTRACTED]
  scripts/setup.sh → package.json
- `DOOH Multi-Screen Platform v2.0` --references--> `DOOH Multi-Screen Platform Setup Guide`  [EXTRACTED]
  README.md → docs/SETUP_GUIDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **DOOH Multi-Screen System Architecture** — server_server_express_app, server_server_websocket_server, player_player_connectwebsocket, player_player_starthttppolling, admin_admin_loadstats, booking_booking_processpayment [INFERRED 0.85]
- **WebSocket Real-Time Synchronization Flow** — server_server_websocket_server, server_server_sendplaylisttoscreen, server_server_getplaylistforscreen, player_player_connectwebsocket, player_player_handlewebsocketmessage [INFERRED 0.90]
- **Complete Ad Booking Workflow** — booking_booking_handlefile, booking_booking_startmoderationcheck, booking_booking_calculateprice, booking_booking_processpayment, server_server_runaimoderation, server_server_getdatabase [INFERRED 0.85]

## Communities (20 total, 13 thin omitted)

### Community 0 - "Server Core Infrastructure"
Cohesion: 0.10
Nodes (18): app, cors, DB_PATH, express, fs, http, logPlayback(), LOGS_PATH (+10 more)

### Community 1 - "Player Display System"
Cohesion: 0.20
Nodes (12): loadPlayer, HTTP Polling Fallback, Ad Rotation System, WebSocket Real-Time Sync, connectWebSocket, fetchPlaylist, handleWebSocketMessage, init (+4 more)

### Community 2 - "Package Metadata"
Cohesion: 0.20
Nodes (9): author, description, devDependencies, nodemon, keywords, license, main, name (+1 more)

### Community 3 - "Playlist & Broadcasting"
Cohesion: 0.40
Nodes (6): Fallback Playlist Strategy, IST Timezone Conversion, broadcastToScreens(), getPlaylistForScreen(), sendPlaylistToScreen(), WebSocket Server

### Community 4 - "NPM Dependencies"
Cohesion: 0.33
Nodes (6): dependencies, cors, express, multer, uuid, ws

### Community 5 - "Database & AI Moderation"
Cohesion: 0.50
Nodes (5): AI Content Moderation, getDatabase(), initDatabases(), runAIModeration(), saveDatabase()

### Community 6 - "NPM Scripts"
Cohesion: 0.40
Nodes (5): scripts, dev, reset, setup, start

## Knowledge Gaps
- **54 isolated node(s):** `name`, `version`, `description`, `main`, `start` (+49 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `NPM Dependencies` to `Package Metadata`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `scripts` connect `NPM Scripts` to `Package Metadata`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `getPlaylistForScreen()` connect `Playlist & Broadcasting` to `Server Core Infrastructure`, `Database & AI Moderation`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `getPlaylistForScreen()` (e.g. with `Fallback Playlist Strategy` and `IST Timezone Conversion`) actually correct?**
  _`getPlaylistForScreen()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `saveDatabase()` (e.g. with `getDatabase()` and `initDatabases()`) actually correct?**
  _`saveDatabase()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _59 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server Core Infrastructure` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._