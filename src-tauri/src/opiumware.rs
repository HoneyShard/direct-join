use regex::Regex;
use reqwest::Client;
use std::fs::{self, File};
use std::io::Write;
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::installer::{download_roblox, install_roblox, InstallProgress};

/// Official Opiumware (Intel) installer. It is a bash script that pins the Roblox
/// version and holds the download urls, so we read those from it instead of hardcoding.
const INSTALL_SCRIPT_URL: &str = "https://opiumwa.re";

struct Manifest {
    version: String,
    dylib: String,
    resources: String,
    ui: String,
}

fn progress(app_handle: &AppHandle, state: &str) {
    let _ = app_handle.emit_to(
        "main",
        "install-progress",
        InstallProgress {
            state: state.into(),
            progress: None,
        },
    );
}

fn run(command: &mut Command, what: &str) -> Result<(), String> {
    let output = command
        .output()
        .map_err(|e| format!("Failed to {}: {}", what, e))?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "Failed to {} (code {}). {}",
        what,
        output.status.code().unwrap_or(-1),
        stderr.trim()
    ))
}

fn script_var(script: &str, name: &str) -> Result<String, String> {
    let regex = Regex::new(&format!(r#"(?m)^\s*{}="([^"]+)""#, name)).unwrap();
    regex
        .captures(script)
        .map(|capture| capture[1].to_string())
        .ok_or_else(|| format!("Could not find {} in the Opiumware install script.", name))
}

async fn fetch_manifest() -> Result<Manifest, String> {
    // curl user agent, the site might serve a landing page to anything else
    let response = Client::new()
        .get(INSTALL_SCRIPT_URL)
        .header("User-Agent", "curl/8.7.1")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    if !status.is_success() {
        return Err(status.to_string());
    }

    let script = response.text().await.map_err(|e| e.to_string())?;

    let manifest = Manifest {
        version: script_var(&script, "version")?,
        dylib: script_var(&script, "DYLIB")?,
        resources: script_var(&script, "RESOURCES")?,
        ui: script_var(&script, "UI")?,
    };

    if !Regex::new(r"^version-[0-9a-f]+$")
        .unwrap()
        .is_match(&manifest.version)
    {
        return Err(format!(
            "Unexpected Roblox version in the Opiumware install script: {}",
            manifest.version
        ));
    }
    for url in [&manifest.dylib, &manifest.resources, &manifest.ui] {
        if !url.starts_with("https://") {
            return Err(format!(
                "Unexpected download url in the Opiumware install script: {}",
                url
            ));
        }
    }

    Ok(manifest)
}

async fn download(app_handle: &AppHandle, url: &str, dest: &Path) -> Result<(), String> {
    let mut response = Client::new()
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

    let mut file = File::create(dest).map_err(|e| e.to_string())?;
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Downloads a zip and extracts it into `dir`.
async fn download_zip(
    app_handle: &AppHandle,
    url: &str,
    dir: &Path,
    name: &str,
) -> Result<(), String> {
    let zip = dir.join(name);
    download(app_handle, url, &zip).await?;
    run(
        Command::new("/usr/bin/unzip")
            .arg("-oq")
            .arg(&zip)
            .arg("-d")
            .arg(dir),
        &format!("unzip {}", name),
    )
}

/// Moves a file or directory, copying when the destination is on another volume.
fn move_path(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        if to.is_dir() {
            fs::remove_dir_all(to).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(to).map_err(|e| e.to_string())?;
        }
    }
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    run(
        Command::new("/usr/bin/ditto").arg(from).arg(to),
        &format!("copy {}", from.display()),
    )?;
    if from.is_dir() {
        fs::remove_dir_all(from).map_err(|e| e.to_string())
    } else {
        fs::remove_file(from).map_err(|e| e.to_string())
    }
}

fn codesign(path: &Path) -> Result<(), String> {
    run(
        Command::new("/usr/bin/codesign")
            .args(["--force", "--deep", "--sign", "-"])
            .arg(path),
        &format!("codesign {}", path.display()),
    )
}

/// Mirrors the official installer: patched Roblox, Opiumware UI and its modules.
/// The modified Roblox stays inside the app data directory so profiles can launch it,
/// the UI goes to /Applications (or ~/Applications) like the official installer does.
pub async fn install(app_handle: &AppHandle) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().unwrap();
    let manifest = fetch_manifest().await?;

    // Opiumware only provides Intel builds for free
    download_roblox(app_handle, "x86_64", &manifest.version).await?;
    install_roblox(app_handle, "Opiumware", "x86_64", &manifest.version).await?;

    let temp = app_data_dir.join("opiumware-tmp");
    let _ = fs::remove_dir_all(&temp);
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;

    let result = setup(app_handle, &manifest, &app_data_dir, &temp).await;
    let _ = fs::remove_dir_all(&temp);
    result
}

async fn setup(
    app_handle: &AppHandle,
    manifest: &Manifest,
    app_data_dir: &Path,
    temp: &Path,
) -> Result<(), String> {
    let roblox = app_data_dir.join("clients").join("Opiumware.app");
    let macos = roblox.join("Contents").join("MacOS");
    let resources = roblox.join("Contents").join("Resources");

    progress(app_handle, "remove-codesign");
    run(
        Command::new("/usr/bin/xattr").arg("-cr").arg(&roblox),
        "clear quarantine attributes",
    )?;
    run(
        Command::new("/usr/bin/codesign")
            .arg("--remove-signature")
            .arg(macos.join("RobloxPlayer")),
        "remove Roblox codesign",
    )?;

    progress(app_handle, "download-dylib");
    download_zip(app_handle, &manifest.dylib, temp, "lib.zip").await?;
    let dylib = temp.join("libOpiumware.dylib");
    if !dylib.exists() {
        return Err("Failed to download libOpiumware.dylib, dylib does not exist.".into());
    }
    move_path(&dylib, &resources.join("libOpiumware.dylib"))?;

    download_zip(app_handle, &manifest.resources, temp, "modules.zip").await?;
    let injector = temp.join("Resources").join("Injector");
    if !injector.exists() {
        return Err("Failed to download Opiumware modules, injector does not exist.".into());
    }
    fs::set_permissions(&injector, fs::Permissions::from_mode(0o755))
        .map_err(|e| e.to_string())?;

    progress(app_handle, "insert-dylib");
    let mimalloc = macos.join("libmimalloc.3.dylib");
    run(
        Command::new(&injector)
            .arg(resources.join("libOpiumware.dylib"))
            .arg(&mimalloc)
            .args(["--strip-codesig", "--all-yes"]),
        "inject Opiumware",
    )?;
    let patched = macos.join("libmimalloc.3.dylib_patched");
    if !patched.exists() {
        return Err("Failed to inject Opiumware, patched library does not exist.".into());
    }
    move_path(&patched, &mimalloc)?;
    let _ = fs::remove_dir_all(macos.join("RobloxPlayerInstaller.app"));
    let _ = fs::remove_dir_all(macos.join("RobloxMenuBar.app"));

    progress(app_handle, "apply-codesign");
    codesign(&roblox)?;

    download_zip(app_handle, &manifest.ui, temp, "ui.zip").await?;
    let ui = temp.join("Opiumware.app");
    if !ui.exists() {
        return Err("Failed to download Opiumware UI, app does not exist.".into());
    }
    install_ui(app_handle, &ui)?;

    // Modules the UI loads from the real home directory
    let opiumware_dir = app_handle
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join("Opiumware");
    let modules = opiumware_dir.join("modules");
    let _ = fs::remove_dir_all(modules.join("LuauLSP"));
    let _ = fs::remove_dir_all(modules.join("decompiler"));
    let _ = fs::remove_file(modules.join("update.json"));
    for dir in ["workspace", "autoexec", "themes"] {
        fs::create_dir_all(opiumware_dir.join(dir)).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(modules.join("decompiler")).map_err(|e| e.to_string())?;
    fs::create_dir_all(modules.join("LuauLSP")).map_err(|e| e.to_string())?;
    move_path(
        &temp.join("Resources").join("Decompiler"),
        &modules.join("decompiler").join("Decompiler"),
    )?;
    move_path(
        &temp.join("Resources").join("LuauLSP"),
        &modules.join("LuauLSP").join("LuauLSP"),
    )?;

    Ok(())
}

/// Places Opiumware.app in /Applications, or ~/Applications without write access.
fn install_ui(app_handle: &AppHandle, ui: &Path) -> Result<(), String> {
    let home = app_handle.path().home_dir().map_err(|e| e.to_string())?;
    let mut last_error = String::new();
    for dir in [PathBuf::from("/Applications"), home.join("Applications")] {
        let target = dir.join("Opiumware.app");
        let attempt = fs::create_dir_all(&dir)
            .map_err(|e| e.to_string())
            .and_then(|_| {
                if target.exists() {
                    fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
                }
                run(
                    Command::new("/usr/bin/ditto").arg(ui).arg(&target),
                    "copy Opiumware UI",
                )
            })
            .and_then(|_| codesign(&target));
        match attempt {
            Ok(()) => return Ok(()),
            Err(err) => last_error = err,
        }
    }
    Err(last_error)
}

/// Runs a user supplied install command (e.g. a private Apple Silicon build) and adopts
/// the Roblox.app it leaves in /Applications or ~/Applications as the Opiumware client.
#[tauri::command]
pub async fn install_opiumware_custom(
    app_handle: AppHandle,
    command: String,
) -> Result<(), String> {
    let command = command.trim().to_string();
    if command.is_empty() {
        return Err("Install command is empty.".into());
    }

    let app_data_dir = app_handle.path().app_data_dir().unwrap();
    let home = app_handle.path().home_dir().map_err(|e| e.to_string())?;
    let started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
        - 2;

    progress(&app_handle, "run-installer");
    // Official scripts call `clear`, which fails without a TERM
    tauri::async_runtime::spawn_blocking(move || {
        run(
            Command::new("/bin/bash")
                .arg("-c")
                .arg(&command)
                .env("TERM", "xterm")
                .stdin(std::process::Stdio::null()),
            "run the install command",
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    // The installer moves a fresh Roblox.app in, which bumps its ctime
    let installed = [
        PathBuf::from("/Applications/Roblox.app"),
        home.join("Applications").join("Roblox.app"),
    ]
    .into_iter()
    .filter(|app| app.join("Contents").join("MacOS").join("RobloxPlayer").exists())
    .filter_map(|app| {
        let ctime = fs::metadata(&app).ok()?.ctime();
        (ctime >= started).then_some((ctime, app))
    })
    .max_by_key(|(ctime, _)| *ctime)
    .map(|(_, app)| app)
    .ok_or_else(|| {
        "The install command finished, but no freshly installed Roblox.app was found in /Applications or ~/Applications."
            .to_string()
    })?;

    progress(&app_handle, "install-roblox");
    let clients_dir = app_data_dir.join("clients");
    fs::create_dir_all(&clients_dir).map_err(|e| e.to_string())?;
    let client_dir = clients_dir.join("Opiumware.app");
    if client_dir.exists() {
        fs::remove_dir_all(&client_dir).map_err(|e| e.to_string())?;
    }
    run(
        Command::new("/usr/bin/ditto").arg(&installed).arg(&client_dir),
        "copy Roblox.app into the client folder",
    )
}
