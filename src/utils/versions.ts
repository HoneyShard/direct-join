import { invoke } from "@tauri-apps/api/core";
import { useVersionStore } from "../store";
import type {
    IMacsploitVersion,
    IOpiumwareVersion,
    IRobloxVersion,
} from "../types/version";
import { showErrorModal } from "./modal";

/**
 * Fetches version information for all supported clients.
 * Updates the version store with the latest versions.
 * @returns True if all versions were fetched successfully, false otherwise
 */
export async function fetchClientVersions() {
    const version = useVersionStore.getState();

    const robloxPromise = invoke<IRobloxVersion>("get_roblox_version").catch(
        (err) => new Error(err),
    );
    const macsploitPromise = invoke<IMacsploitVersion>(
        "get_macsploit_version",
    ).catch((err) => new Error(err));
    const opiumwarePromise = invoke<IOpiumwareVersion>(
        "get_opiumware_version",
    ).catch((err) => new Error(err));

    const [roblox, macsploit, opiumware] = await Promise.all([
        robloxPromise,
        macsploitPromise,
        opiumwarePromise,
    ]);

    if (roblox instanceof Error) {
        showErrorModal("Failed to fetch Roblox version", roblox.message);
        return false;
    }
    version.setRoblox(roblox);

    if (macsploit instanceof Error) {
        showErrorModal("Failed to fetch MacSploit version", macsploit.message);
        return false;
    }
    version.setMacsploit(macsploit);

    if (opiumware instanceof Error) {
        showErrorModal("Failed to fetch Opiumware version", opiumware.message);
        return false;
    }
    version.setOpiumware(opiumware);

    return true;
}
