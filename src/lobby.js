import { Foyer } from "@jay23606/foyer";

/**
 * Manyhands Game Lobby
 * Uses foyer to broadcast and discover active islands
 */

export class GameLobby {
  constructor(config = {}) {
    this.foyer = null;
    this.config = config;
    this.islands = new Map(); // island_name -> { players, supabaseUrl, key, lastSeen }
    this.onIslandUpdate = null;
    this.onError = null;
  }

  /**
   * Join the global lobby to discover islands
   */
  async connect(signalingUrl = "wss://signal.jay23606.workers.dev") {
    try {
      this.foyer = new Foyer({
        signalingUrl,
        roomId: "manyhands-lobby",
        userName: `traveler-${Math.random().toString(36).slice(2, 9)}`,
      });

      this.foyer.on("peer", (peer) => {
        // New player in lobby, get their island info
        peer.send({ type: "request_island_info" });
      });

      this.foyer.on("message", (peer, msg) => {
        if (msg.type === "island_info") {
          this.islands.set(msg.islandName, {
            players: msg.players,
            supabaseUrl: msg.supabaseUrl,
            supabaseKey: msg.supabaseKey,
            lastSeen: Date.now(),
          });
          if (this.onIslandUpdate) this.onIslandUpdate([...this.islands.values()]);
        }
      });

      await this.foyer.connect();
      console.log("Connected to game lobby");
    } catch (e) {
      const err = `Lobby connection failed: ${e.message}`;
      console.error(err);
      if (this.onError) this.onError(err);
    }
  }

  /**
   * Broadcast this island to the lobby (call when joining an island)
   */
  advertiseIsland(islandName, players, supabaseUrl, supabaseKey) {
    if (!this.foyer) return;
    this.foyer.broadcast({
      type: "island_info",
      islandName,
      players,
      supabaseUrl,
      supabaseKey,
      timestamp: Date.now(),
    });
  }

  /**
   * Get list of currently advertised islands
   */
  getAvailableIslands() {
    const now = Date.now();
    const timeout = 30000; // 30 second stale cutoff
    const active = [];
    
    for (const [name, info] of this.islands) {
      if (now - info.lastSeen < timeout) {
        active.push({ name, ...info });
      } else {
        this.islands.delete(name);
      }
    }
    
    return active.sort((a, b) => b.players - a.players); // Sort by player count descending
  }

  disconnect() {
    if (this.foyer) {
      this.foyer.disconnect();
      this.foyer = null;
    }
  }
}
