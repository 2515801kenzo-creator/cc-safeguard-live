/* CC SafeGuard Live — Supabase browser client bootstrap.
 * Uses only the publishable/anon key. Never put a service_role key here.
 */
(function (global) {
  "use strict";
  const config = global.CCSafeSupabaseConfig || {};
  const api = {
    client: null,
    ready: false,
    async init() {
      if (!global.supabase || typeof global.supabase.createClient !== "function") {
        throw new Error("Supabase JS belum dimuat. Tambahkan supabase-js v2 sebelum file ini.");
      }
      if (!config.url || !config.anonKey || !config.eventSlug) {
        throw new Error("Isi supabase-config.js dengan Project URL, publishable/anon key, dan eventSlug.");
      }
      this.client = global.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        realtime: { params: { eventsPerSecond: 10 } }
      });
      // Event directory exposes only non-sensitive slug/name metadata so the
      // browser can resolve the event before a user has authenticated.
      const { data, error } = await this.client.from("events").select("id,slug,name").eq("slug", config.eventSlug).single();
      if (error) throw error;
      this.event = data;
      this.ready = true;
      return data;
    },
    async signIn(email, password) {
      this.requireReady();
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: membership, error: memberError } = await this.client
        .from("event_members").select("role,active").eq("event_id", this.event.id).eq("user_id", data.user.id).single();
      if (memberError || !membership || !membership.active) {
        await this.client.auth.signOut();
        throw new Error("Akun belum terdaftar atau dinonaktifkan pada event ini.");
      }
      this.membership = membership;
      return { user: data.user, membership };
    },
    async signOut() {
      this.requireReady();
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
      this.membership = null;
    },
    async session() {
      this.requireReady();
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    requireReady() {
      if (!this.ready || !this.client || !this.event) throw new Error("Supabase belum diinisialisasi.");
    },
    async loadState(stateKey) {
      this.requireReady();
      const { data, error } = await this.client.from("event_state")
        .select("payload,revision,updated_at").eq("event_id", this.event.id).eq("state_key", stateKey).maybeSingle();
      if (error) throw error;
      return data;
    },
    async saveState(stateKey, payload) {
      this.requireReady();
      if (!["match","schedule","teams","cards","operations_audit","daily_archive"].includes(stateKey)) {
        throw new Error("state_key tidak diizinkan.");
      }
      const { data: authData, error: authError } = await this.client.auth.getUser();
      if (authError || !authData.user) throw new Error("Login Supabase diperlukan.");
      const { data, error } = await this.client.from("event_state").upsert({
        event_id: this.event.id, state_key: stateKey, payload,
        updated_by: authData.user.id, updated_at: new Date().toISOString()
      }, { onConflict: "event_id,state_key" }).select("revision,updated_at").single();
      if (error) throw error;
      return data;
    },
    subscribeState(stateKeys, onChange) {
      this.requireReady();
      const channel = this.client.channel("ccsl:" + this.event.id + ":" + stateKeys.join(","));
      stateKeys.forEach((stateKey) => {
        channel.on("postgres_changes", {
          event: "*", schema: "public", table: "event_state",
          filter: "event_id=eq." + this.event.id
        }, (change) => {
          if (change.new && stateKeys.includes(change.new.state_key)) onChange(change.new.state_key, change.new.payload, change);
        });
      });
      channel.subscribe();
      return () => this.client.removeChannel(channel);
    },
    async saveReport(report) {
      this.requireReady();
      const { data: authData, error: authError } = await this.client.auth.getUser();
      if (authError || !authData.user) throw new Error("Login Supabase diperlukan.");
      const { data, error } = await this.client.from("reports").upsert({
        id: report.id, event_id: this.event.id, report_type: report.type,
        title: report.title, payload: report, status: report.status,
        created_by: authData.user.id, updated_at: new Date().toISOString()
      }, { onConflict: "id" }).select().single();
      if (error) throw error;
      return data;
    },
    subscribeReports(onChange) {
      this.requireReady();
      const channel = this.client.channel("ccsl-reports:" + this.event.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "reports", filter: "event_id=eq." + this.event.id }, onChange)
        .subscribe();
      return () => this.client.removeChannel(channel);
    }
  };
  global.CCSafeSupabase = api;
})(window);
