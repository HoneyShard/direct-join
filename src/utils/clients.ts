import { invoke } from "@tauri-apps/api/core";
import {
    CLIENT_NAME_MACSPLOIT,
    CLIENT_NAME_OPIUMWARE,
    CLIENT_NAME_VANILLA,
} from "../constants";
import { useConfigStore, useStore, useVersionStore } from "../store";
import { updateProfile } from "./profiles";
import { IState } from "../types";
import { noteLaunch } from "./relaunch";

/**
 * Launches a client for a profile with the given cookie.
 * Unlocks keychain, writes cookies, modifies bundle identifier, and starts the client.
 * @param client - The client name to launch
 * @param profileId - The ID of the profile to launch
 * @param cookie - The cookie for the profile
 * @returns The launch result with state information
 */
export async function launchClient(
    client: string,
    profileId: string,
    cookie: string,
) {
    const store = useStore.getState();

    const profile = store.profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error("Profile not found. Please try again.");

    const unlocked = await invoke<number>("unlock_keychain", {
        profileId,
    }).catch((err: string) => new Error(err));
    if (unlocked instanceof Error) throw unlocked;

    if (unlocked === 50)
        throw new Error(
            "Keychain was not found. It seems like your profile is corrupted, please remove the profile and create it again.",
        );
    else if (unlocked === 51) {
    } // Keychain cannot be unlocked, just proceed
    else if (unlocked !== 0)
        throw new Error(`Could not unlock keychain with code ${unlocked}.`);

    const created = await invoke<null>("create_environment", {
        id: profileId,
    }).catch((err) => new Error(err));
    if (created instanceof Error) throw created;

    const written = await invoke<null>("write_cookies", {
        profileId,
        cookie,
    }).catch((err) => new Error(err));
    if (written instanceof Error) throw written;

    const modified = await invoke<null>("modify_bundle_identifier", {
        client,
        profileId,
    }).catch((err) => new Error(err));
    if (modified instanceof Error) throw modified;

    const launched = await invoke<IState>("launch_client", {
        client,
        profileId,
        cookie,
        placeId: profile.placeId ?? null,
        jobId: profile.jobId || null,
    }).catch((err) => new Error(err));
    if (launched instanceof Error) throw launched;

    const newProfile = {
        ...profile,
        lastPlayedAt: Date.now(),
    };

    await updateProfile(newProfile);

    return launched;
}

/**
 * Full launch flow for a profile: validates the setup, resolves the client,
 * launches it and records the state in the store. Shared by the Launch button
 * and the auto relaunch watchdog.
 * @param profileId - The profile to launch
 * @param client - The client name to launch
 */
export async function startProfile(profileId: string, client: string) {
    const profile = useStore
        .getState()
        .profiles.find((p) => p.id === profileId);
    if (!profile) throw new Error("Profile not found. Please try again.");

    const launched = await launchClient(client, profile.id, profile.cookie);
    if (client === CLIENT_NAME_VANILLA) {
        launched.connected = true;
        launched.client = CLIENT_NAME_VANILLA;
    }
    useStore.getState().updateState(launched);
    noteLaunch(profile.id, client);
}

/**
 * Stops a running client process.
 * @param pid - The process ID of the client to stop
 */
export async function stopClient(pid: number) {
    const stopped = await invoke("stop_client", { pid }).catch(
        (err) => new Error(err),
    );
    if (stopped instanceof Error) throw stopped;
    if (!stopped)
        throw new Error("Client could not be stopped due to an unknown error.");
}

/**
 * Installs a client and adds it to the configuration.
 * @param client - The client name to install
 */
export async function installClient(client: string) {
    const version = useVersionStore.getState();

    let clientVersion = version.roblox.clientVersionUpload;
    let dylibVersion = version.roblox.version;
    if (client === CLIENT_NAME_VANILLA) {
        if (!clientVersion)
            throw new Error("Roblox version is not fetched yet.");
        if (!dylibVersion) throw new Error("Dylib version is not fetched yet.");
    } else if (client === CLIENT_NAME_MACSPLOIT) {
        if (
            !version.macsploit.clientVersionUpload ||
            !version.macsploit.relVersion
        )
            throw new Error("MacSploit version is not fetched yet.");

        clientVersion = version.macsploit.clientVersionUpload;
        dylibVersion = version.macsploit.relVersion;
    } else if (client === CLIENT_NAME_OPIUMWARE) {
        if (
            !version.opiumware.SupportedRobloxVersion ||
            !version.opiumware.CurrentVersion
        )
            throw new Error("Opiumware version is not fetched yet.");

        clientVersion = version.opiumware.SupportedRobloxVersion;
        dylibVersion = version.opiumware.CurrentVersion;
    }

    const installed = await invoke("install_client", {
        client,
        version: clientVersion,
    }).catch((err: string) => new Error(err));
    if (installed instanceof Error) throw installed;

    const config = useConfigStore.getState();
    const newConfig = {
        ...config.config,
        clients: [
            ...config.config.clients,
            {
                name: client,
                version: dylibVersion,
            },
        ],
    };

    const written = await import("./config").then(({ writeConfig }) =>
        writeConfig(newConfig),
    );
    if (written) config.setConfig(newConfig);

    return;
}

/**
 * Removes a client from the system and updates the configuration.
 * @param client - The client name to remove
 */
export async function removeClient(client: string) {
    const installed = await invoke("remove_client", { client }).catch(
        (err: string) => new Error(err),
    );
    if (installed instanceof Error) throw installed;

    const config = useConfigStore.getState();
    const newConfig = {
        ...config.config,
        client: config.config.client === client ? null : config.config.client,
        clients: config.config.clients.filter((c) => c.name !== client),
    };
    config.setConfig(newConfig);

    await import("./config").then(({ writeConfig }) => writeConfig(newConfig));
}
