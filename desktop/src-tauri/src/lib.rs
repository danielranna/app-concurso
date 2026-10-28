use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Local;
use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Notify;
use url::Url;

const DEFAULT_ORIGIN: &str = "http://127.0.0.1:3000";
const POLL_SECS: u64 = 60;

struct Pulse {
    primed: bool,
    block_id: Option<String>,
    status: Option<String>,
    due: i64,
}

impl Default for Pulse {
    fn default() -> Self {
        Self {
            primed: false,
            block_id: None,
            status: None,
            due: 0,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct Persisted {
    user_id: Option<String>,
    x: Option<i32>,
    y: Option<i32>,
    always_on_top: bool,
}

impl Default for Persisted {
    fn default() -> Self {
        Self {
            user_id: None,
            x: None,
            y: None,
            always_on_top: false,
        }
    }
}

struct TrayItems {
    always_on_top: CheckMenuItem<tauri::Wry>,
    autostart: CheckMenuItem<tauri::Wry>,
}

struct AppState {
    user_id: Mutex<Option<String>>,
    pulse: Mutex<Pulse>,
    persisted: Mutex<Persisted>,
    state_path: PathBuf,
    origin: String,
    wake: Arc<Notify>,
}

#[derive(Deserialize)]
struct PulseBody {
    agenda: PulseAgenda,
    study: PulseStudy,
}

#[derive(Deserialize)]
struct PulseAgenda {
    now: Option<PulseNow>,
}

#[derive(Deserialize)]
struct PulseNow {
    id: String,
    title: String,
    start_time: String,
    end_time: String,
    status: String,
}

#[derive(Deserialize)]
struct PulseStudy {
    flashcards_due: i64,
}

fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() < 80
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn read_url_file(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        return Some(line.to_string());
    }
    None
}

fn normalize_origin(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    let without_widget = trimmed.trim_end_matches("/widget").trim_end_matches('/');
    without_widget.to_string()
}

fn resolve_origin(app_data: &Path, exe_dir: Option<&Path>) -> String {
    if let Ok(from_env) = std::env::var("WIDGET_APP_URL") {
        let origin = normalize_origin(&from_env);
        if !origin.is_empty() {
            return origin;
        }
    }
    if let Some(dir) = exe_dir {
        if let Some(from_file) = read_url_file(&dir.join("widget-url.txt")) {
            return normalize_origin(&from_file);
        }
    }
    if let Some(from_cwd) = read_url_file(Path::new("widget-url.txt")) {
        return normalize_origin(&from_cwd);
    }
    if let Some(from_data) = read_url_file(&app_data.join("widget-url.txt")) {
        return normalize_origin(&from_data);
    }
    DEFAULT_ORIGIN.to_string()
}

fn load_persisted(path: &Path) -> Persisted {
    let Ok(text) = fs::read_to_string(path) else {
        return Persisted::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_persisted(path: &Path, value: &Persisted) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(value) {
        let _ = fs::write(path, text);
    }
}

fn reveal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toast(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

fn allowed_url(raw: &str, origin: &str) -> bool {
    let Ok(parsed) = Url::parse(raw) else {
        return false;
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    if parsed.scheme() == "https" && (host == "www.tecconcursos.com.br" || host == "tecconcursos.com.br")
    {
        return true;
    }
    let Ok(base) = Url::parse(origin) else {
        return false;
    };
    let Some(base_host) = base.host_str() else {
        return false;
    };
    let local = |host: &str| host == "localhost" || host == "127.0.0.1";
    if local(host) && local(base_host) && parsed.scheme() == "http" && base.scheme() == "http" {
        return parsed.port().unwrap_or(80) == base.port().unwrap_or(80);
    }
    parsed.scheme() == base.scheme()
        && host == base_host
        && parsed.port_or_known_default() == base.port_or_known_default()
}

fn snapshot_from(body: &PulseBody) -> (Option<String>, Option<String>, i64, Option<&PulseNow>) {
    let due = body.study.flashcards_due;
    match &body.agenda.now {
        Some(now) => (Some(now.id.clone()), Some(now.status.clone()), due, Some(now)),
        None => (None, None, due, None),
    }
}

fn agenda_body(now: &PulseNow) -> String {
    let label = if now.status == "next" { "A seguir" } else { "Agora" };
    format!("{label}: {} ({}–{})", now.title, now.start_time, now.end_time)
}

async fn poll_once(app: &AppHandle, client: &reqwest::Client) {
    let (user_id, origin) = {
        let state = app.state::<AppState>();
        let user_id = state.user_id.lock().ok().and_then(|guard| guard.clone());
        let origin = state.origin.clone();
        (user_id, origin)
    };
    let Some(user_id) = user_id else {
        return;
    };
    if !is_safe_id(&user_id) {
        return;
    }

    let now = Local::now();
    let today = now.format("%Y-%m-%d");
    let hhmm = now.format("%H:%M");
    let url = format!(
        "{origin}/api/widget/summary?user_id={user_id}&period=7d&today={today}&now={hhmm}"
    );
    let response = match client.get(&url).send().await {
        Ok(response) => response,
        Err(err) => {
            eprintln!("widget poll: {err}");
            return;
        }
    };
    if !response.status().is_success() {
        eprintln!("widget poll: status {}", response.status());
        return;
    }
    let body: PulseBody = match response.json().await {
        Ok(body) => body,
        Err(err) => {
            eprintln!("widget poll: {err}");
            return;
        }
    };

    let (block_id, status, due, now_block) = snapshot_from(&body);
    let state = app.state::<AppState>();
    let mut pulse = match state.pulse.lock() {
        Ok(pulse) => pulse,
        Err(_) => return,
    };

    if pulse.primed {
        let block_changed = pulse.block_id != block_id && block_id.is_some();
        let started = pulse.block_id.is_some()
            && pulse.block_id == block_id
            && pulse.status.as_deref() == Some("next")
            && status.as_deref() == Some("active");
        if (block_changed || started) {
            if let Some(now_block) = now_block {
                toast(app, "Agenda", &agenda_body(now_block));
            }
        }
        if due > pulse.due {
            let label = if due == 1 {
                "1 flashcard pendente".to_string()
            } else {
                format!("{due} flashcards pendentes")
            };
            toast(app, "Flashcards", &label);
        }
    }

    pulse.primed = true;
    pulse.block_id = block_id;
    pulse.status = status;
    pulse.due = due;
}

fn spawn_poll(app: AppHandle) {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .expect("cliente http");
    tauri::async_runtime::spawn(async move {
        loop {
            poll_once(&app, &client).await;
            let wake = app.state::<AppState>().wake.clone();
            tokio::select! {
                _ = wake.notified() => {}
                _ = tokio::time::sleep(Duration::from_secs(POLL_SECS)) => {}
            }
        }
    });
}

#[tauri::command]
fn set_user(state: State<'_, AppState>, user_id: String) -> Result<(), String> {
    if !is_safe_id(&user_id) {
        return Err("user_id inválido".into());
    }
    let changed = {
        let mut guard = state.user_id.lock().map_err(|_| "estado indisponível")?;
        let changed = guard.as_deref() != Some(user_id.as_str());
        *guard = Some(user_id.clone());
        changed
    };
    if changed {
        if let Ok(mut pulse) = state.pulse.lock() {
            *pulse = Pulse::default();
        }
    }
    if let Ok(mut persisted) = state.persisted.lock() {
        persisted.user_id = Some(user_id);
        write_persisted(&state.state_path, &persisted);
    }
    state.wake.notify_one();
    Ok(())
}

#[tauri::command]
fn show_widget(app: AppHandle) {
    reveal(&app);
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let origin = app.state::<AppState>().origin.clone();
    if !allowed_url(&url, &origin) {
        return Err("link não permitido".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|err| err.to_string())
}

fn toggle_always_on_top(app: &AppHandle) {
    let state = app.state::<AppState>();
    let items = app.state::<TrayItems>();
    let next = !items.always_on_top.is_checked().unwrap_or(false);
    let _ = items.always_on_top.set_checked(next);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(next);
    }
    if let Ok(mut persisted) = state.persisted.lock() {
        persisted.always_on_top = next;
        write_persisted(&state.state_path, &persisted);
    }
}

fn toggle_autostart(app: &AppHandle) {
    let items = app.state::<TrayItems>();
    let enable = !items.autostart.is_checked().unwrap_or(false);
    let result = if enable {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };
    if result.is_ok() {
        let _ = items.autostart.set_checked(enable);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            reveal(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .invoke_handler(tauri::generate_handler![set_user, show_widget, open_external])
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            let _ = fs::create_dir_all(&app_data);
            let state_path = app_data.join("state.json");
            let first_run = !state_path.exists();
            let persisted = load_persisted(&state_path);
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(|dir| dir.to_path_buf()));
            let origin = resolve_origin(&app_data, exe_dir.as_deref());
            if !app_data.join("widget-url.txt").exists() {
                let _ = fs::write(
                    app_data.join("widget-url.txt"),
                    "# Origem do app, sem barra no final.\nhttp://127.0.0.1:3000\n",
                );
            }

            let user_id = persisted.user_id.clone();
            let always_on_top = persisted.always_on_top;
            app.manage(AppState {
                user_id: Mutex::new(user_id),
                pulse: Mutex::new(Pulse::default()),
                persisted: Mutex::new(persisted),
                state_path: state_path.clone(),
                origin: origin.clone(),
                wake: Arc::new(Notify::new()),
            });

            if first_run {
                let _ = app.autolaunch().enable();
                let state = app.state::<AppState>();
                if let Ok(persisted) = state.persisted.lock() {
                    write_persisted(&state_path, &persisted);
                }
            }

            let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
            let show_item = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
            let top_item = CheckMenuItem::with_id(
                app,
                "always_on_top",
                "Sempre no topo",
                true,
                always_on_top,
                None::<&str>,
            )?;
            let auto_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Iniciar com o Windows",
                true,
                autostart_on,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &top_item, &auto_item, &quit_item])?;
            app.manage(TrayItems {
                always_on_top: top_item,
                autostart: auto_item,
            });

            let icon = tauri::include_image!("icons/32x32.png");
            TrayIconBuilder::with_id("tray")
                .icon(icon)
                .menu(&menu)
                .tooltip("Via Aprovação")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => reveal(app),
                    "quit" => app.exit(0),
                    "always_on_top" => toggle_always_on_top(app),
                    "autostart" => toggle_autostart(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        reveal(tray.app_handle());
                    }
                })
                .build(app)?;

            let window = app.get_webview_window("main").ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::Other, "janela principal ausente")
            })?;
            if always_on_top {
                let _ = window.set_always_on_top(true);
            }
            if let Ok(persisted) = app.state::<AppState>().persisted.lock() {
                if let (Some(x), Some(y)) = (persisted.x, persisted.y) {
                    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                }
            }

            let page = format!("{origin}/widget");
            window.navigate(Url::parse(&page)?)?;

            let hide_window = window.clone();
            let move_app = app.handle().clone();
            window.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = hide_window.hide();
                }
                WindowEvent::Moved(position) => {
                    let path = move_app.state::<AppState>().state_path.clone();
                    if let Ok(mut persisted) = move_app.state::<AppState>().persisted.lock() {
                        persisted.x = Some(position.x);
                        persisted.y = Some(position.y);
                        write_persisted(&path, &persisted);
                    }
                }
                _ => {}
            });

            let click_app = app.handle().clone();
            app.notification().on_action(move |action| {
                if action.action_id() != "tap" {
                    return;
                }
                let app_for_thread = click_app.clone();
                let _ = click_app.run_on_main_thread(move || reveal(&app_for_thread));
            })?;

            spawn_poll(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao abrir o widget");
}
