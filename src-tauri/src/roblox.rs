use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fmt::Debug;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct RobloxProfile {
    pub id: i64,
    pub name: String,
    pub displayName: String,
}

#[tauri::command]
pub async fn get_roblox_profile(
    app_handle: AppHandle,
    cookie: String,
) -> Result<RobloxProfile, String> {
    let client = Client::new();
    let response = client
        .get("https://users.roblox.com/v1/users/authenticated")
        .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
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

    let profile = response
        .json::<RobloxProfile>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(profile)
}

#[derive(Debug, Deserialize)]
pub struct RobloxThumbnailData {
    data: Vec<RobloxThumbnail>,
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case, dead_code)]
pub struct RobloxThumbnail {
    targetId: i64,
    state: String,
    imageUrl: String,
    version: String,
}

#[tauri::command]
pub async fn get_roblox_thumbnail(
    app_handle: AppHandle,
    user_id: i64,
) -> Result<Option<String>, String> {
    let client = Client::new();
    let url = format!("https://thumbnails.roblox.com/v1/users/avatar-bust?userIds={}&size=420x420&format=Png&isCircular=false", user_id);
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
        .json::<RobloxThumbnailData>()
        .await
        .map_err(|e| e.to_string())?;
    if body.data.len() == 0 {
        return Err("404 Not Found".into());
    }

    let profile = body.data.first().expect("profile does not exist");
    if profile.state == "Pending" {
        // thumbnail is being rendered by Roblox, just load it later
        return Ok(None);
    } else if profile.state != "Completed" {
        return Err(profile.state.clone());
    }

    Ok(Some(profile.imageUrl.to_owned()))
}

fn user_agent(app_handle: &AppHandle) -> String {
    format!("RaptorManager/{}", app_handle.package_info().version)
}

/// Fetches the one-time authentication ticket the player uses to log in.
/// Roblox answers the first POST with a 403 carrying a CSRF token, so it is retried once with it.
async fn fetch_auth_ticket(app_handle: &AppHandle, cookie: &str) -> Result<String, String> {
    let client = Client::new();
    let mut csrf = String::new();

    for _ in 0..2 {
        let response = client
            .post("https://auth.roblox.com/v1/authentication-ticket")
            .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
            .header("User-Agent", user_agent(app_handle))
            .header("Referer", "https://www.roblox.com/")
            .header("Content-Type", "application/json")
            .header("x-csrf-token", &csrf)
            .body("{}")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if response.status().as_u16() == 403 {
            if let Some(token) = response.headers().get("x-csrf-token") {
                csrf = token.to_str().map_err(|e| e.to_string())?.to_string();
                continue;
            }
        }
        if !response.status().is_success() {
            return Err(format!("Authentication ticket request failed: {}", response.status()));
        }

        return response
            .headers()
            .get("rbx-authentication-ticket")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string)
            .ok_or_else(|| "Roblox did not return an authentication ticket.".to_string());
    }

    Err("Could not obtain a CSRF token from Roblox.".into())
}

fn percent_encode(input: &str) -> String {
    input
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{:02X}", b),
        })
        .collect()
}

/// Builds the `roblox-player:` URL that makes the player join `place_id` directly,
/// optionally into a specific server (`job_id`).
pub async fn build_join_url(
    app_handle: &AppHandle,
    cookie: &str,
    place_id: u64,
    job_id: Option<&str>,
) -> Result<String, String> {
    let ticket = fetch_auth_ticket(app_handle, cookie).await?;

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let tracker_id = 100_000_000_000u128 + nanos % 899_999_999_999u128;
    let timestamp = nanos / 1_000_000;

    let launcher_url = match job_id.filter(|j| !j.is_empty()) {
        Some(job) => format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGameJob&browserTrackerId={}&placeId={}&gameId={}&isPlayTogetherGame=false&isTeleport=true",
            tracker_id,
            place_id,
            percent_encode(job)
        ),
        None => format!(
            "https://assetgame.roblox.com/game/PlaceLauncher.ashx?request=RequestGame&browserTrackerId={}&placeId={}&isPlayTogetherGame=false",
            tracker_id, place_id
        ),
    };

    Ok(format!(
        "roblox-player:1+launchmode:play+gameinfo:{}+launchtime:{}+placelauncherurl:{}+browsertrackerid:{}+robloxLocale:en_us+gameLocale:en_us+channel:+LaunchExp:InApp",
        ticket,
        timestamp,
        percent_encode(&launcher_url),
        tracker_id
    ))
}

/// Returns the user's presence type: 0 = offline, 1 = online, 2 = in game, 3 = in studio.
#[tauri::command]
pub async fn get_roblox_presence(
    app_handle: AppHandle,
    cookie: String,
    user_id: i64,
) -> Result<i64, String> {
    let client = Client::new();
    let mut csrf = String::new();

    for _ in 0..2 {
        let response = client
            .post("https://presence.roblox.com/v1/presence/users")
            .header("Cookie", format!(".ROBLOSECURITY={}", cookie))
            .header("User-Agent", user_agent(&app_handle))
            .header("x-csrf-token", &csrf)
            .json(&serde_json::json!({ "userIds": [user_id] }))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if response.status().as_u16() == 403 {
            if let Some(token) = response.headers().get("x-csrf-token") {
                csrf = token.to_str().map_err(|e| e.to_string())?.to_string();
                continue;
            }
        }
        if !response.status().is_success() {
            return Err(response.status().to_string());
        }

        let body = response
            .json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())?;
        return body["userPresences"][0]["userPresenceType"]
            .as_i64()
            .ok_or_else(|| "Malformed presence response.".to_string());
    }

    Err("Could not obtain a CSRF token from Roblox.".into())
}
