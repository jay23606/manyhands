import { createClient } from "@supabase/supabase-js";
import { createMediaMesh } from "@jay23606/foyer";

// Supabase owns durable state; foyer owns a separate WebRTC voice mesh.
export class Network {
  constructor(onWorld, onPeers, onMessage) {
    Object.assign(this, {
      onWorld,
      onPeers,
      onMessage,
      peers: [],
      connected: false,
      busy: false,
    });
    this.id = crypto.randomUUID();
  }
  async connect(url, key, room) {
    await this.disconnect();
    this.room = room;
    this.client = createClient(url, key);
    const {
      data: { session },
    } = await this.client.auth.getSession();
    if (!session) {
      const { error } = await this.client.auth.signInAnonymously();
      if (error)
        throw new Error(
          "Enable anonymous sign-ins in Supabase Authentication. " +
            error.message,
        );
    }
    const { data, error } = await this.client.rpc("mh_enter_world", {
      room_name: room,
    });
    if (error)
      throw new Error("Run supabase/schema.sql first. " + error.message);
    this.onWorld(data);
    this.channel = this.client.channel("manyhands:" + room, {
      config: { presence: { key: this.id } },
    });
    this.channel.on("presence", { event: "sync" }, () => {
      this.peers = Object.values(this.channel.presenceState())
        .flat()
        .filter((p) => p.id !== this.id);
      this.onPeers(this.peers);
    });
    this.channel.on("broadcast", { event: "changed" }, () => this.pull());
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Realtime connection timed out.")),
        12000,
      );
      this.channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        }
        if (status === "CHANNEL_ERROR") {
          clearTimeout(timer);
          reject(new Error("Could not connect to the island."));
        }
      });
    });
    const iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ];
    if (import.meta.env.VITE_TURN_URL)
      iceServers.push({
        urls: import.meta.env.VITE_TURN_URL,
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_CREDENTIAL,
      });
    this.media = createMediaMesh({
      supabase: this.client,
      roomId: "manyhands:" + room,
      playerId: this.id,
      iceServers,
    });
    this.connected = true;
    await this.track();
    this.timer = setInterval(() => this.tick(), 4000);
    this.tick();
  }
  async pull() {
    if (!this.connected) return;
    const { data, error } = await this.client.rpc("mh_read_world", {
      room_name: this.room,
    });
    if (!error && data && this.connected) this.onWorld(data);
  }
  async tick() {
    if (this.busy || !this.connected || document.hidden || !navigator.onLine)
      return;
    this.busy = true;
    try {
      const { data, error } = await this.client.rpc("mh_step_world", {
        room_name: this.room,
      });
      if (error) throw error;
      if (this.connected) this.onWorld(data);
      await this.track();
    } catch {
      this.onMessage(
        "Connection interrupted. Shared progress is waiting to reconnect.",
      );
    } finally {
      this.busy = false;
    }
  }
  async act(type, index) {
    if (!navigator.onLine)
      throw new Error("You are offline. Shared changes need a connection.");
    const { data, error } = await this.client.rpc("mh_edit_world", {
      room_name: this.room,
      action_name: type,
      tile_index: index,
    });
    if (error) throw new Error(error.message);
    this.onWorld(data);
    this.channel.send({ type: "broadcast", event: "changed", payload: {} });
  }
  async track() {
    if (this.channel)
      await this.channel.track({
        id: this.id,
        voice: this.media?.currentStatus === "live",
      });
  }
  setPosition() {}
  async toggleVoice() {
    if (!this.connected)
      throw new Error("Join a shared island before enabling voice.");
    if (this.media.currentStatus === "live") {
      this.media.stop();
      await this.track();
      return false;
    }
    const status = await this.media.start();
    if (status !== "live") {
      this.media.stop();
      throw new Error(
        status === "denied"
          ? "Microphone access was declined. You can play without voice."
          : "Microphone unavailable. Voice requires HTTPS and microphone access.",
      );
    }
    this.media.setMuted(false);
    await this.track();
    return true;
  }
  async disconnect() {
    clearInterval(this.timer);
    this.connected = false;
    this.media?.stop();
    this.media = null;
    if (this.channel) {
      await this.channel.untrack();
      await this.client.removeChannel(this.channel);
    }
    this.channel = null;
    this.peers = [];
    this.onPeers([]);
  }
}
