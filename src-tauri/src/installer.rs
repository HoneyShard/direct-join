use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize, Deserialize)]
pub struct InstallProgress {
    pub state: String,
    pub progress: Option<Vec<u64>>,
}

pub async fn download_roblox(
    app_handle: &AppHandle,
    arch: &str,
    version: &str,
) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let clients_dir = app_data_dir.join("clients");
    if !clients_dir.exists() {
        fs::create_dir_all(&clients_dir).map_err(|e| e.to_string())?;
    }

    let client_dir = clients_dir.join(arch.to_owned() + "-" + version + ".zip");
    if !client_dir.exists() {
        let mut file = File::create(&client_dir).map_err(|e| e.to_string())?;

        let client = Client::new();
        let url;
        if arch == "aarch64" {
            url = format!(
                "https://setup.rbxcdn.com/mac/arm64/{}-RobloxPlayer.zip",
                version
            );
        } else {
            url = format!("https://setup.rbxcdn.com/mac/{}-RobloxPlayer.zip", version);
        }

        let mut response = client
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

        let mut downloaded = 0;
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            if let Some(length) = response.content_length() {
                let _ = app_handle.emit_to(
                    "main",
                    "install-progress",
                    InstallProgress {
                        state: "download-roblox".into(),
                        progress: Some(vec![downloaded, length + downloaded]), // consumed + unconsumed = total size
                    },
                );
            }
        }
    }

    Ok(())
}

pub async fn install_insert_dylib(app_handle: &AppHandle) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let insert_dylib_dir = app_data_dir.join("insert_dylib");
    if !insert_dylib_dir.exists() {
        let client = Client::new();
        let response = client
            .get("https://github.com/DollarNoob/Macsploit-Mirror/raw/main/insert_dylib")
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

        let _ = app_handle.emit_to(
            "main",
            "install-progress",
            InstallProgress {
                state: "download-insert-dylib".into(),
                progress: None,
            },
        );

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;

        let mut file = File::create(&insert_dylib_dir).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    let _ = app_handle.emit_to(
        "main",
        "install-progress",
        InstallProgress {
            state: "install-insert-dylib".into(),
            progress: None,
        },
    );

    let mut child = Command::new("/bin/chmod")
        .arg("+x")
        .arg(insert_dylib_dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    let status = child.wait().map_err(|e| e.to_string())?;
    if let Some(code) = status.code() {
        if code != 0 {
            return Err(format!(
                "Failed to install insert_dylib with code {}.",
                code
            ));
        }

        Ok(())
    } else {
        Err("Failed to install insert_dylib with code -1.".into())
    }
}

pub async fn install_roblox(
    app_handle: &AppHandle,
    client: &str,
    arch: &str,
    version: &str,
) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let roblox_dir = app_data_dir
        .join("clients")
        .join(arch.to_owned() + "-" + version + ".zip");
    if !roblox_dir.exists() {
        return Err(format!("Roblox {} is not installed. An anti-virus software might be interrupting the installation process.", version));
    }

    let _ = app_handle.emit_to(
        "main",
        "install-progress",
        InstallProgress {
            state: "install-roblox".into(),
            progress: None,
        },
    );

    let mut child = Command::new("/usr/bin/unzip")
        .arg("-o")
        .arg("-q")
        .arg("-d")
        .arg(app_data_dir.join("clients"))
        .arg(roblox_dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    let status = child.wait().map_err(|e| e.to_string())?;
    if let Some(code) = status.code() {
        if code != 0 {
            return Err(format!(
                "Failed to unzip Roblox {} with code {}. Please try again after cleaning installation cache.",
                version, code
            ));
        }

        let robloxplayer_dir = app_data_dir.join("clients").join("RobloxPlayer.app");

        let executable_dir = robloxplayer_dir.join("Contents").join("MacOS");

        let roblox_installer_dir = executable_dir.join("RobloxPlayerInstaller.app");
        fs::remove_dir_all(roblox_installer_dir).map_err(|e| e.to_string())?;

        let client_dir = app_data_dir
            .join("clients")
            .join(client.to_owned() + ".app");
        fs::rename(robloxplayer_dir, client_dir).map_err(|e| e.to_string())?;

        Ok(())
    } else {
        Err(format!("Failed to unzip Roblox {} with code -1.", version))
    }
}

pub async fn download_dylib(app_handle: &AppHandle, client: &str) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let client_dir = app_data_dir
        .join("clients")
        .join(client.to_owned() + ".app");
    let dylib_dir = client_dir
        .join("Contents")
        .join("MacOS")
        .join(client.to_owned().to_lowercase() + ".dylib");

    let _ = app_handle.emit_to(
        "main",
        "install-progress",
        InstallProgress {
            state: "download-dylib".into(),
            progress: None,
        },
    );

    if client == "MacSploit" {
        let url;
        if std::env::consts::ARCH == "aarch64" {
            url = "https://git.raptor.fun/arm/macsploit.dylib";
        } else {
            url = "https://git.raptor.fun/main/macsploit.dylib";
        }

        let client = Client::new();
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

        let bytes = response.bytes().await.map_err(|e| e.to_string())?;

        let mut file = File::create(&dylib_dir).map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub async fn insert_dylib(app_handle: &AppHandle, client: &str) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let roblox_dir = app_data_dir
        .join("clients")
        .join(client.to_owned() + ".app");
    if !roblox_dir.exists() {
        return Err("Client is not installed. An anti-virus software might be interfering with the installation process.".into());
    }

    let insert_dylib_dir = app_data_dir.join("insert_dylib");
    let executable_dir = roblox_dir.join("Contents").join("MacOS");
    let dylib_dir = executable_dir.join(client.to_owned().to_lowercase() + ".dylib");
    let player_dir = executable_dir.join("RobloxPlayer");

    let _ = app_handle.emit_to(
        "main",
        "install-progress",
        InstallProgress {
            state: "insert-dylib".into(),
            progress: None,
        },
    );

    let mut child = Command::new(insert_dylib_dir)
        .arg(dylib_dir)
        .arg(&player_dir)
        .arg(&player_dir)
        .arg("--overwrite")
        .arg("--strip-codesig")
        .arg("--all-yes")
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let handle = tokio::task::spawn_blocking(move || {
        for line in BufReader::new(stdout).lines().flatten() {
            return line;
        }
        return "insert_dylib did not return a response.".into();
    });

    let result = handle.await.map_err(|e| e.to_string())?;
    if !result.starts_with("Added LC_LOAD_DYLIB to ") {
        return Err(result);
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if let Some(code) = status.code() {
        if code != 0 {
            return Err(format!("Failed to insert dylib with code {}.", code));
        }

        Ok(())
    } else {
        Err("Failed to insert dylib with code -1.".into())
    }
}

pub async fn codesign(app_handle: &AppHandle, client: &str, sign: bool) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let roblox_dir = app_data_dir
        .join("clients")
        .join(client.to_owned() + ".app");
    if !roblox_dir.exists() {
        return Err("Client is not installed. An anti-virus software might be interrupting the installation process.".into());
    }

    let mut child;
    if sign {
        let _ = app_handle.emit_to(
            "main",
            "install-progress",
            InstallProgress {
                state: "apply-codesign".into(),
                progress: None,
            },
        );

        child = Command::new("/usr/bin/codesign")
            .arg("-s")
            .arg("-")
            .arg(&roblox_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        let _ = app_handle.emit_to(
            "main",
            "install-progress",
            InstallProgress {
                state: "remove-codesign".into(),
                progress: None,
            },
        );

        child = Command::new("/usr/bin/codesign")
            .arg("--remove-signature")
            .arg(&roblox_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if let Some(code) = status.code() {
        if code != 0 {
            return Err(format!("Failed to codesign with code {}.", code));
        }

        Ok(())
    } else {
        Err("Failed to codesign with code -1.".into())
    }
}

#[tauri::command]
pub async fn install_client(
    app_handle: AppHandle,
    client: String,
    version: String,
) -> Result<(), String> {
    // Opiumware ships its own patched Roblox, see opiumware.rs
    if client == "Opiumware" {
        return crate::opiumware::install(&app_handle).await;
    }

    let arch = std::env::consts::ARCH;

    download_roblox(&app_handle, arch, &version)
        .await
        .map_err(|e| e.to_string())?;

    if client != "Vanilla" {
        install_insert_dylib(&app_handle)
            .await
            .map_err(|e| e.to_string())?;
    }

    install_roblox(&app_handle, &client, arch, &version)
        .await
        .map_err(|e| e.to_string())?;

    if client != "Vanilla" {
        download_dylib(&app_handle, &client)
            .await
            .map_err(|e| e.to_string())?;
    }

    // remove codesign in arm64 or vanilla (fix crash for intel macs)
    if arch == "aarch64" || client == "Vanilla" {
        codesign(&app_handle, &client, false)
            .await
            .map_err(|e| e.to_string())?;
    }

    if client != "Vanilla" {
        insert_dylib(&app_handle, &client)
            .await
            .map_err(|e| e.to_string())?;
    }

    // add codesign in arm64 or vanilla (fix crash for intel macs)
    if arch == "aarch64" || client == "Vanilla" {
        codesign(&app_handle, &client, true)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_client(app_handle: AppHandle, client: String) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let client_dir = app_data_dir.join("clients").join(client + ".app");
    if !client_dir.exists() {
        return Ok(());
    }

    fs::remove_dir_all(&client_dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn clean_cache(app_handle: AppHandle) -> Result<u64, String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let clients_dir = app_data_dir.join("clients");
    if !clients_dir.exists() {
        return Ok(0);
    }

    let mut cleaned_bytes = 0;
    for entry in fs::read_dir(&clients_dir).map_err(|e| e.to_string())? {
        let e = entry.map_err(|e| e.to_string())?;
        if !e.file_name().to_str().unwrap().ends_with(".app") {
            let metadata = e.metadata().unwrap();
            if metadata.is_dir() {
                fs::remove_dir_all(e.path()).map_err(|e| e.to_string())?;
            } else if metadata.is_file() {
                fs::remove_file(e.path()).map_err(|e| e.to_string())?;
            }
            cleaned_bytes += metadata.len();
        }
    }

    Ok(cleaned_bytes)
}

#[tauri::command]
pub async fn clean_leftover_cache(
    app_handle: AppHandle,
    versions: Vec<String>,
) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();

    let clients_dir = app_data_dir.join("clients");
    if !clients_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(&clients_dir).map_err(|e| e.to_string())? {
        let e = entry.map_err(|e| e.to_string())?;
        if e.file_name().to_str().unwrap().ends_with(".zip") && // only check .zip files
            !versions.contains(
                &e.file_name().to_str().unwrap()
                    .replace("x86_64-", "")
                    .replace("aarch64-", "")
                    .replace(".zip", "")
            )
        // check if version is not used anymore by all clients
        {
            let metadata = e.metadata().unwrap();
            if metadata.is_file() {
                fs::remove_file(e.path()).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}
