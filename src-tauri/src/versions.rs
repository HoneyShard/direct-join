use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct RobloxVersion {
    pub version: String,
    pub clientVersionUpload: String,
    pub bootstrapperVersion: String,
}

#[tauri::command]
pub async fn get_roblox_version(app_handle: AppHandle) -> Result<RobloxVersion, String> {
    let client = Client::new();
    let url = format!("https://clientsettingscdn.roblox.com/v2/client-version/MacPlayer");
    let response = client
        .get(url)
        .header(
            "User-Agent",
            format!(
                "RaptorManager/{}",
                app_handle.package_info().version.to_string()
            ),
        )
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    if !status.is_success() {
        return Err(status.to_string());
    }

    let body = response
        .json::<RobloxVersion>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(body)
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct MacsploitVersion {
    pub clientVersionUpload: String,
    pub appVersion: String,
    pub clientVersion: String,
    pub relVersion: String,
    pub channel: String,
    pub changelog: String,
}

#[tauri::command]
pub async fn get_macsploit_version(app_handle: AppHandle) -> Result<MacsploitVersion, String> {
    let client = Client::new();
    let url = format!("https://git.raptor.fun/main/version.json");
    let response = client
        .get(url)
        .header(
            "User-Agent",
            format!(
                "RaptorManager/{}",
                app_handle.package_info().version.to_string()
            ),
        )
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    if !status.is_success() {
        return Err(status.to_string());
    }

    let body = response
        .json::<MacsploitVersion>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(body)
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct OpiumwareVersion {
    pub CurrentVersion: String,
    pub SupportedRobloxVersion: String,
    pub Changelog: String,
    pub RequiredUpd: bool,
}

#[tauri::command]
pub async fn get_opiumware_version(app_handle: AppHandle) -> Result<OpiumwareVersion, String> {
    let client = Client::new();
    let url =
        format!("https://raw.githubusercontent.com/norbyv1/OpiumwareInstall/main/version.json");
    let response = client
        .get(url)
        .header(
            "User-Agent",
            format!(
                "RaptorManager/{}",
                app_handle.package_info().version.to_string()
            ),
        )
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    if !status.is_success() {
        return Err(status.to_string());
    }

    let body = response
        .json::<OpiumwareVersion>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(body)
}
