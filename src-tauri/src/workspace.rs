use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

/// Generated per profile (contains the profile id), so it is never copied, wiped or backed up.
const INIT_SCRIPT: &str = "RaptorManager.lua";
/// Safety backups taken before overriding are pruned beyond this many.
const AUTO_BACKUP_LIMIT: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum ClientKind {
    MacSploit,
    Opiumware,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Autoexec,
    Workspace,
}

impl Kind {
    fn name(self) -> &'static str {
        match self {
            Kind::Autoexec => "autoexec",
            Kind::Workspace => "workspace",
        }
    }
}

impl ClientKind {
    /// Folder inside a profile environment (its fake $HOME).
    fn folder(self, kind: Kind) -> PathBuf {
        match (self, kind) {
            (ClientKind::MacSploit, Kind::Autoexec) => {
                Path::new("Documents").join("Macsploit Automatic Execution")
            }
            (ClientKind::MacSploit, Kind::Workspace) => {
                Path::new("Documents").join("Macsploit Workspace")
            }
            (ClientKind::Opiumware, Kind::Autoexec) => Path::new("Opiumware").join("autoexec"),
            (ClientKind::Opiumware, Kind::Workspace) => Path::new("Opiumware").join("workspace"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupMeta {
    pub id: String,
    pub name: String,
    pub client: ClientKind,
    pub kinds: Vec<Kind>,
    /// Unix epoch milliseconds
    pub created_at: u64,
    pub source_profile_id: String,
    pub auto: bool,
    pub files: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncResult {
    pub targets: u32,
    pub files: u64,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn env_dir(data: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) {
        return Err(format!("Invalid profile id '{}'.", id));
    }
    let dir = data.join("environments").join(id);
    if !dir.is_dir() {
        return Err(format!(
            "Profile folder for '{}' does not exist. Please delete and create the profile again.",
            id
        ));
    }
    Ok(dir)
}

fn backups_dir(data: &Path) -> PathBuf {
    data.join("backups")
}

/// Recursively copies `src` into `dst`, skipping symlinks and Finder junk.
/// `skip_init` only applies to the top level, where the generated init script lives.
fn copy_dir(src: &Path, dst: &Path, skip_init: bool, files: &mut u64) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == ".DS_Store" || (skip_init && name == INIT_SCRIPT) {
            continue;
        }

        let file_type = entry.file_type()?;
        let target = dst.join(&name);
        if file_type.is_dir() {
            copy_dir(&entry.path(), &target, false, files)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target)?;
            *files += 1;
        }
    }
    Ok(())
}

/// Empties `dir` without removing it, optionally keeping the init script.
fn clear_dir(dir: &Path, keep_init: bool) -> io::Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if keep_init && entry.file_name() == INIT_SCRIPT {
            continue;
        }
        if entry.file_type()?.is_dir() {
            fs::remove_dir_all(entry.path())?;
        } else {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

/// `replace` mirrors `src` onto `dst`; otherwise files are merged over what is already there.
fn sync_dir(src: &Path, dst: &Path, kind: Kind, replace: bool, files: &mut u64) -> Result<(), String> {
    let is_autoexec = kind == Kind::Autoexec;
    if replace {
        clear_dir(dst, is_autoexec).map_err(|e| e.to_string())?;
    }
    if src.is_dir() {
        copy_dir(src, dst, is_autoexec, files).map_err(|e| e.to_string())?;
    } else {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn read_meta(dir: &Path) -> Option<BackupMeta> {
    let contents = fs::read_to_string(dir.join("meta.json")).ok()?;
    serde_json::from_str(&contents).ok()
}

fn list_backups_in(data: &Path) -> Vec<BackupMeta> {
    let mut backups: Vec<BackupMeta> = fs::read_dir(backups_dir(data))
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|entry| read_meta(&entry.path()))
                .collect()
        })
        .unwrap_or_default();
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    backups
}

fn prune_auto_backups(data: &Path) {
    let autos = list_backups_in(data)
        .into_iter()
        .filter(|backup| backup.auto)
        .skip(AUTO_BACKUP_LIMIT);
    for backup in autos {
        let _ = fs::remove_dir_all(backups_dir(data).join(&backup.id));
    }
}

/// Returns `None` when none of the requested folders exist (nothing to back up).
fn create_backup(
    data: &Path,
    profile_id: &str,
    client: ClientKind,
    kinds: &[Kind],
    name: String,
    auto: bool,
) -> Result<Option<BackupMeta>, String> {
    let env = env_dir(data, profile_id)?;

    let mut id = now_millis().to_string();
    while backups_dir(data).join(&id).exists() {
        id.push('x');
    }
    let dir = backups_dir(data).join(&id);

    let mut files = 0;
    let mut saved = vec![];
    for &kind in kinds {
        let src = env.join(client.folder(kind));
        if !src.is_dir() {
            continue;
        }
        if let Err(err) = copy_dir(
            &src,
            &dir.join(kind.name()),
            kind == Kind::Autoexec,
            &mut files,
        ) {
            let _ = fs::remove_dir_all(&dir);
            return Err(err.to_string());
        }
        saved.push(kind);
    }

    if saved.is_empty() {
        let _ = fs::remove_dir_all(&dir);
        return Ok(None);
    }

    let meta = BackupMeta {
        id,
        name,
        client,
        kinds: saved,
        created_at: now_millis(),
        source_profile_id: profile_id.to_string(),
        auto,
        files,
    };
    let contents = serde_json::to_string(&meta).map_err(|e| e.to_string())?;
    fs::write(dir.join("meta.json"), contents).map_err(|e| e.to_string())?;

    if auto {
        prune_auto_backups(data);
    }
    Ok(Some(meta))
}

fn sync(
    data: &Path,
    source: &str,
    targets: &[String],
    client: ClientKind,
    kinds: &[Kind],
    replace: bool,
    backup_first: bool,
) -> Result<SyncResult, String> {
    if kinds.is_empty() {
        return Err("Select autoexec, workspace or both.".into());
    }
    let source_env = env_dir(data, source)?;

    let mut result = SyncResult { targets: 0, files: 0 };
    for target in targets.iter().filter(|target| *target != source) {
        let target_env = env_dir(data, target)?;
        if replace && backup_first {
            create_backup(data, target, client, kinds, "Before override".into(), true)?;
        }
        for &kind in kinds {
            let folder = client.folder(kind);
            sync_dir(
                &source_env.join(&folder),
                &target_env.join(&folder),
                kind,
                replace,
                &mut result.files,
            )?;
        }
        result.targets += 1;
    }

    if result.targets == 0 {
        return Err("Select at least one target profile other than the source.".into());
    }
    Ok(result)
}

fn restore(
    data: &Path,
    backup_id: &str,
    targets: &[String],
    kinds: &[Kind],
    replace: bool,
    backup_first: bool,
) -> Result<SyncResult, String> {
    if !valid_id(backup_id) {
        return Err("Invalid backup id.".into());
    }
    let dir = backups_dir(data).join(backup_id);
    let meta = read_meta(&dir).ok_or("Backup not found.")?;

    let kinds: Vec<Kind> = meta
        .kinds
        .iter()
        .copied()
        .filter(|kind| kinds.contains(kind))
        .collect();
    if kinds.is_empty() {
        return Err("The backup does not contain the selected folders.".into());
    }
    if targets.is_empty() {
        return Err("Select at least one profile to restore to.".into());
    }

    let mut result = SyncResult { targets: 0, files: 0 };
    for target in targets {
        let target_env = env_dir(data, target)?;
        if replace && backup_first {
            create_backup(data, target, meta.client, &kinds, "Before restore".into(), true)?;
        }
        for &kind in &kinds {
            sync_dir(
                &dir.join(kind.name()),
                &target_env.join(meta.client.folder(kind)),
                kind,
                replace,
                &mut result.files,
            )?;
        }
        result.targets += 1;
    }
    Ok(result)
}

async fn run<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| e.to_string())?
}

fn data_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    app_handle.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn workspace_sync(
    app_handle: AppHandle,
    source: String,
    targets: Vec<String>,
    client: ClientKind,
    kinds: Vec<Kind>,
    replace: bool,
    backup_first: bool,
) -> Result<SyncResult, String> {
    let data = data_dir(&app_handle)?;
    run(move || sync(&data, &source, &targets, client, &kinds, replace, backup_first)).await
}

#[tauri::command]
pub async fn workspace_backup_create(
    app_handle: AppHandle,
    source: String,
    client: ClientKind,
    kinds: Vec<Kind>,
    name: String,
) -> Result<BackupMeta, String> {
    let data = data_dir(&app_handle)?;
    run(move || {
        let name = match name.trim() {
            "" => "Backup".to_string(),
            name => name.to_string(),
        };
        create_backup(&data, &source, client, &kinds, name, false)?
            .ok_or_else(|| "Nothing to back up: the selected folders do not exist yet.".into())
    })
    .await
}

#[tauri::command]
pub async fn workspace_backup_list(app_handle: AppHandle) -> Result<Vec<BackupMeta>, String> {
    let data = data_dir(&app_handle)?;
    run(move || Ok(list_backups_in(&data))).await
}

#[tauri::command]
pub async fn workspace_backup_restore(
    app_handle: AppHandle,
    backup_id: String,
    targets: Vec<String>,
    kinds: Vec<Kind>,
    replace: bool,
    backup_first: bool,
) -> Result<SyncResult, String> {
    let data = data_dir(&app_handle)?;
    run(move || restore(&data, &backup_id, &targets, &kinds, replace, backup_first)).await
}

#[tauri::command]
pub async fn workspace_backup_delete(
    app_handle: AppHandle,
    backup_id: String,
) -> Result<(), String> {
    let data = data_dir(&app_handle)?;
    run(move || {
        if !valid_id(&backup_id) {
            return Err("Invalid backup id.".into());
        }
        let dir = backups_dir(&data).join(&backup_id);
        if dir.exists() {
            fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn workspace_open_backups(app_handle: AppHandle) -> Result<(), String> {
    let dir = backups_dir(&data_dir(&app_handle)?);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::process::Command::new("open")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
