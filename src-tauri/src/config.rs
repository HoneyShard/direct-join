use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{Read, Write},
    process::Command,
    vec,
};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub client: Option<String>,
    pub clients: Vec<Client>,
    pub decompiler: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Client {
    pub name: String,
    pub version: String,
}

#[tauri::command]
pub fn read_config(app_handle: AppHandle) -> Result<Config, String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let config_dir = app_data_dir.join("config.json");
    if !config_dir.exists() {
        let default_config = Config {
            client: None,
            clients: vec![],
            decompiler: "medal".into(),
        };
        write_config(app_handle, default_config.clone()).map_err(|e| e.to_string())?;
        return Ok(default_config);
    }

    let mut file = File::open(&config_dir).map_err(|e| e.to_string())?;

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| e.to_string())?;

    let config = serde_json::from_str::<Config>(&contents).map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
pub fn write_config(app_handle: AppHandle, config: Config) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    }

    let config_dir = app_data_dir.join("config.json");

    let contents = serde_json::to_string::<Config>(&config).map_err(|e| e.to_string())?;

    let mut file = File::create(&config_dir).map_err(|e| e.to_string())?;
    file.write_all(&contents.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_decompiler(
    state: tauri::State<'_, crate::decompiler::AppState>,
    decompiler: String,
) -> Result<(), ()> {
    let mut decom_config = state.decompiler.lock().await;
    *decom_config = decompiler;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[allow(non_snake_case)]
#[serde(default)]
pub struct AutoRelaunch {
    pub onCrash: bool,
    pub onOffline: bool,
    /// Restart every N minutes, 0 disables
    pub forceRestartMinutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct Profile {
    pub id: String,
    pub name: Option<String>,
    pub cookie: String,
    pub userId: i64,
    pub displayName: String,
    pub username: String,
    pub thumbnail: Option<String>,
    pub note: String,
    pub lastPlayedAt: u64,
    #[serde(default)]
    pub placeId: Option<u64>,
    #[serde(default)]
    pub jobId: Option<String>,
    #[serde(default)]
    pub autoRelaunch: AutoRelaunch,
}

#[tauri::command]
pub fn read_profiles(app_handle: AppHandle) -> Result<Vec<Profile>, String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let profile_dir = app_data_dir.join("profiles.json");
    if !profile_dir.exists() {
        write_profiles(app_handle, vec![]).map_err(|e| e.to_string())?;
        return Ok(vec![]);
    }

    let mut file = File::open(&profile_dir).map_err(|e| e.to_string())?;

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| e.to_string())?;

    let profiles = serde_json::from_str::<Vec<Profile>>(&contents).map_err(|e| e.to_string())?;
    Ok(profiles)
}

#[tauri::command]
pub fn write_profiles(app_handle: AppHandle, profiles: Vec<Profile>) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let profile_dir = app_data_dir.join("profiles.json");
    if !profile_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
    }

    let profile = serde_json::to_string::<Vec<Profile>>(&profiles).map_err(|e| e.to_string())?;

    let mut file = File::create(&profile_dir).map_err(|e| e.to_string())?;
    file.write_all(&profile.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_environment(app_handle: AppHandle, id: String) -> Result<(), String> {
    let init_script = format!(
        "-- Raptor Manager Init Script; DO NOT TOUCH!
local profile = '{}'

-- Custom Decompiler
getgenv().decompile = function(script)
    return request({{
        Url = 'http://localhost:6767/decompile',
        Method = 'POST',
        Body = getscriptbytecode(script)
    }}).Body
end

local executor = identifyexecutor()

-- getcustomasset
if executor == 'MacSploit' then
    getgenv().getcustomasset = function(path)
        local response = request({{
            Url = 'http://localhost:6767/getcustomasset/' .. profile,
            Method = 'POST',
            Body = path
        }}).Body
        assert(response:find('^rbxasset://models/LivePackages'), response)
        return response
    end
end
",
        &id
    );

    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let profile_dir = app_data_dir.join("environments").join(id);
    fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;

    // MacSploit - Documents
    let documents_dir = profile_dir.join("Documents");
    fs::create_dir_all(&documents_dir).map_err(|e| e.to_string())?;

    // MacSploit - Automatic Execution
    let macsploit_autoexe_dir = documents_dir.join("Macsploit Automatic Execution");
    fs::create_dir_all(&macsploit_autoexe_dir).map_err(|e| e.to_string())?;

    // MacSploit - Init Script
    let mut file = File::create(&macsploit_autoexe_dir.join("RaptorManager.lua"))
        .map_err(|e| e.to_string())?;
    file.write_all(&init_script.as_bytes())
        .map_err(|e| e.to_string())?;

    // MacSploit - Downloads
    let downloads_dir = profile_dir.join("Downloads");
    fs::create_dir_all(&downloads_dir).map_err(|e| e.to_string())?;

    // Opiumware
    let opiumware_dir = profile_dir.join("Opiumware");
    fs::create_dir_all(&opiumware_dir).map_err(|e| e.to_string())?;

    // Opiumware - Automatic Execution
    let opiumware_autoexe_dir = opiumware_dir.join("autoexec");
    fs::create_dir_all(&opiumware_autoexe_dir).map_err(|e| e.to_string())?;

    // Opiumware - Init Script
    let mut file = File::create(&opiumware_autoexe_dir.join("RaptorManager.lua"))
        .map_err(|e| e.to_string())?;
    file.write_all(&init_script.as_bytes())
        .map_err(|e| e.to_string())?;

    /*
    // Roblox - Custom Assets
    let content_dir = profile_dir
        .join("Applications")
        .join("Roblox.app")
        .join("Contents")
        .join("Resources")
        .join("content");
    fs::create_dir_all(&content_dir).map_err(|e| e.to_string())?;*/

    Ok(())
}

#[tauri::command]
pub fn remove_environment(app_handle: AppHandle, id: String) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let environment_dir = app_data_dir.join("environments");
    if !environment_dir.exists() {
        fs::create_dir_all(&environment_dir).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let profile_dir = environment_dir.join(&id);
    if profile_dir.exists() {
        fs::remove_dir_all(&profile_dir).map_err(|e| e.to_string())?;
    }

    let data_dir = app_handle.path().data_dir().unwrap();
    let library_dir = data_dir.parent().unwrap(); // $HOME/Library
    let http_storages_dir = library_dir.join("HTTPStorages"); // $HOME/Library/HTTPStorages
    let caches_dir = library_dir.join("Caches"); // $HOME/Library/Caches
    let preferences_dir = library_dir.join("Preferences"); // $HOME/Library/Preferences
    let webkit_dir = library_dir.join("WebKit"); // $HOME/Library/WebKit
    let scripts_dir = library_dir.join("Application Scripts"); // $HOME/Library/Application\ Scripts
    let containers_dir = library_dir.join("Containers");

    // Clear HTTPStorages
    let storage_dir = http_storages_dir.join(format!("com.roblox.RobloxPlayer.{}", &id));
    if storage_dir.exists() {
        fs::remove_dir_all(&storage_dir).map_err(|e| e.to_string())?;
    }

    let binary_cookie_dir =
        http_storages_dir.join(format!("com.roblox.RobloxPlayer.{}.binarycookies", &id));
    if binary_cookie_dir.exists() {
        fs::remove_file(&binary_cookie_dir).map_err(|e| e.to_string())?;
    }

    // Clean Caches
    let cache_dir = caches_dir.join(format!("com.roblox.RobloxPlayer.{}", &id));
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    // Clean Preferences
    let preference_dir = preferences_dir.join(format!("com.roblox.RobloxPlayer.{}.plist", &id));
    if preference_dir.exists() {
        fs::remove_file(&preference_dir).map_err(|e| e.to_string())?;
    }

    // Clean WebKit
    let webdata_dir = webkit_dir.join(format!("com.roblox.RobloxPlayer.{}", &id));
    if webdata_dir.exists() {
        fs::remove_dir_all(&webdata_dir).map_err(|e| e.to_string())?;
    }

    // Clean Application Scripts
    let appscripts_dir = scripts_dir.join(format!("com.roblox.RobloxPlayer.{}", &id));
    if appscripts_dir.exists() {
        fs::remove_dir_all(&appscripts_dir).map_err(|e| e.to_string())?;
    }

    // Clean Container
    let container_dir = containers_dir.join(format!("com.roblox.RobloxPlayer.{}", &id));
    if container_dir.exists() {
        fs::remove_dir_all(&container_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn open_profile_folder(app_handle: AppHandle, id: String) -> Result<i32, String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let profile_dir = app_data_dir.join("environments").join(id);
    let exists = fs::exists(&profile_dir).map_err(|e| e.to_string())?;
    if !exists {
        return Err(
            "Profile folder does not exist. Please delete and create a profile again.".into(),
        );
    }

    let mut child = Command::new("open")
        .args(&profile_dir.to_str())
        .spawn()
        .map_err(|e| e.to_string())?;

    let status = child.wait().map_err(|e| e.to_string())?;
    if let Some(code) = status.code() {
        Ok(code)
    } else {
        Ok(-1)
    }
}

#[tauri::command]
pub fn open_client_folder(app_handle: AppHandle) -> Result<i32, String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let client_dir = app_data_dir.join("clients");
    let exists = fs::exists(&client_dir).map_err(|e| e.to_string())?;
    if !exists {
        return Err("Client folder does not exist.".into());
    }

    let mut child = Command::new("open")
        .args(&client_dir.to_str())
        .spawn()
        .map_err(|e| e.to_string())?;

    let status = child.wait().map_err(|e| e.to_string())?;
    if let Some(code) = status.code() {
        Ok(code)
    } else {
        Ok(-1)
    }
}
