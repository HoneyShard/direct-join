import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { DEFAULT_AUTO_RELAUNCH } from "../types/profile";
import { showErrorModal } from "./modal";

const RELAUNCH_DELAY_MS = 5_000;
const WATCH_INTERVAL_MS = 15_000;
const PRESENCE_INTERVAL_MS = 30_000;
// Presence lags behind a fresh launch, don't judge a client before this
const PRESENCE_GRACE_MS = 2 * 60_000;
const OFFLINE_STRIKES = 3;
// Give up after this many failed relaunches in a row (banned, bad cookie, ...)
const MAX_ATTEMPTS = 3;
// A launch that survives this long counts as healthy and resets the attempts
const HEALTHY_MS = 5 * 60_000;

interface Watch {
    client: string;
    launchedAt: number;
    attempts: number;
    offlineStrikes: number;
    lastPresenceAt: number;
    busy: boolean;
}

// Only profiles launched during this session are ever watched
const watched = new Map<string, Watch>();

/** Records a successful launch so the watchdog can replay it. */
export function noteLaunch(profileId: string, client: string) {
    const previous = watched.get(profileId);
    watched.set(profileId, {
        client,
        launchedAt: Date.now(),
        attempts: previous?.attempts ?? 0,
        offlineStrikes: 0,
        lastPresenceAt: Date.now(),
        busy: false,
    });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function relaunch(profileId: string, reason: string) {
    const watch = watched.get(profileId);
    if (!watch || watch.busy) return;
    if (watch.attempts >= MAX_ATTEMPTS) {
        watched.delete(profileId);
        const profile = useStore
            .getState()
            .profiles.find((p) => p.id === profileId);
        showErrorModal(
            "Auto relaunch stopped",
            `${profile?.name ?? profile?.username ?? profileId} failed to stay up after ${MAX_ATTEMPTS} relaunches (${reason}).`,
        );
        return;
    }
    watch.busy = true;
    watch.attempts += 1;

    try {
        const state = () =>
            useStore.getState().states.find((s) => s.profileId === profileId);

        // Force kill whatever is left (hung / offline client)
        const pid = state()?.pid;
        if (pid) await invoke("stop_client", { pid }).catch(() => {});
        await sleep(RELAUNCH_DELAY_MS);

        // The user may have removed or launched the profile in the meantime
        if (!watched.has(profileId) || state()?.pid) return;

        const { startProfile } = await import("./clients");
        await startProfile(profileId, watch.client);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Auto relaunch failed for ${profileId}:`, message);
    } finally {
        const current = watched.get(profileId);
        if (current) current.busy = false;
    }
}

/** Called when a client process exits. Relaunches after a crash if enabled. */
export function onClientClosed(profileId: string, exitCode: number) {
    const profile = useStore
        .getState()
        .profiles.find((p) => p.id === profileId);
    const watch = watched.get(profileId);
    if (!profile || !watch || watch.busy) return;

    // 0 = closed by the user, 9 = killed by us (stop button / force restart)
    const crashed = exitCode !== 0 && exitCode !== 9;
    if (!crashed || !profile.autoRelaunch?.onCrash) {
        if (exitCode === 0 || exitCode === 9) watched.delete(profileId);
        return;
    }
    relaunch(profileId, `exit code ${exitCode}`);
}

async function tick() {
    const { profiles, states } = useStore.getState();
    const now = Date.now();

    for (const profile of profiles) {
        const watch = watched.get(profile.id);
        const state = states.find((s) => s.profileId === profile.id);
        if (!watch || watch.busy || !state?.pid) continue;

        const options = profile.autoRelaunch ?? DEFAULT_AUTO_RELAUNCH;

        if (now - watch.launchedAt > HEALTHY_MS) watch.attempts = 0;

        if (
            options.forceRestartMinutes > 0 &&
            now - watch.launchedAt >= options.forceRestartMinutes * 60_000
        ) {
            watch.attempts = 0;
            relaunch(profile.id, "scheduled restart");
            continue;
        }

        if (
            options.onOffline &&
            state.connected &&
            now - watch.launchedAt >= PRESENCE_GRACE_MS &&
            now - watch.lastPresenceAt >= PRESENCE_INTERVAL_MS
        ) {
            watch.lastPresenceAt = now;
            const presence = await invoke<number>("get_roblox_presence", {
                cookie: profile.cookie,
                userId: profile.userId,
            }).catch(() => null);
            // Network/API errors say nothing about the client, ignore them
            if (presence === null) continue;

            watch.offlineStrikes =
                presence === 0 ? watch.offlineStrikes + 1 : 0;
            if (watch.offlineStrikes >= OFFLINE_STRIKES) {
                watch.offlineStrikes = 0;
                relaunch(profile.id, "offline presence");
            }
        }
    }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the background loop. Returns a function that stops it. */
export function startWatchdog() {
    if (!timer) timer = setInterval(tick, WATCH_INTERVAL_MS);
    return () => {
        if (timer) clearInterval(timer);
        timer = null;
    };
}
