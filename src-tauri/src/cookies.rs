use crate::binarycookies::{BinaryCookies, Cookie, Page};
use std::fs::{self, File};
use std::io::Write;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder};

#[tauri::command]
pub async fn write_cookies(
    app_handle: AppHandle,
    profile_id: String,
    cookie: String,
) -> Result<(), String> {
    let data_dir = app_handle.path().data_dir().unwrap();
    let library_dir = data_dir.parent().unwrap(); // $HOME/Library
    let file_dir = library_dir.join("HTTPStorages").join(format!(
        "com.roblox.RobloxPlayer.{}.binarycookies",
        profile_id
    ));

    let cookie = Cookie {
        domain: ".roblox.com".into(),
        name: ".ROBLOSECURITY".into(),
        path: Some("/".into()),
        value: cookie,
        secure: Some(true),
        http_only: Some(true),
        expiration: Some(SystemTime::now() + Duration::from_secs(60 * 60 * 24 * 30)), // 30 days
        creation: Some(SystemTime::now()),
    };

    let page = Page::new(vec![cookie]);

    let binary_cookies = BinaryCookies::new(vec![page]);
    let bytes = binary_cookies.build();

    let mut file = File::create(&file_dir).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn import_cookies(app_handle: AppHandle) -> Result<(), String> {
    let app_handle_navigation = app_handle.clone();
    let _ = WebviewWindowBuilder::new(
        &app_handle,
        "login",
        tauri::WebviewUrl::App("https://www.roblox.com/login".into()),
    )
        .title("Roblox")
        .inner_size(500.0, 764.0)
        .resizable(false)
        .minimizable(false)
        .incognito(true)
        .on_navigation(move |url| {
            if url.path() == "/" || url.path() == "/home" {
                if let Some(window) = app_handle_navigation.get_webview_window("login") {
                    if let Ok(cookies) = window.cookies_for_url(tauri::Url::parse("https://roblox.com/").unwrap()) {
                        for cookie in cookies {
                            if cookie.name() == ".ROBLOSECURITY" {
                                let _ = window.close();
                                let _ = app_handle_navigation.emit_to("main", "import_cookies", cookie.value());
                                return false;
                            }
                        }
                    }
                }
            }
            return true;
        })
        .initialization_script("
            // Remove decorations
            window.addEventListener('DOMContentLoaded', () => {
                const header = document.getElementById('header');
                if (header) header.remove();
                const footer = document.getElementById('footer-container');
                if (footer) footer.remove();
                const content = document.getElementById('content');
                if (content) content.style.paddingTop = '0';
            });

            // Fix for annoying keychain popups when there is a login
            // https://github.com/TheRouletteBoi/altman/blob/main/src/ui/webview/webview_macos.mm#L155
            Object.defineProperty(window, 'crypto', {
                get: () => ({
                    subtle: null,
                    getRandomValues: (arr) => {
                        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
                        return arr;
                    }
                })
            });
        ")
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}
