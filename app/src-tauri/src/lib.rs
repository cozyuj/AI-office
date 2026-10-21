//! AI Office 데스크탑 껍데기: Node 서버를 띄우고 그 페이지를 창에 보여준다. 메뉴바(tray)에서 열기/숨기기/항상 위/종료.
use std::net::{SocketAddr, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

const PORT: u16 = 4777;

fn port_open(port: u16) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

use std::path::{Path, PathBuf};

fn home_dir() -> Option<PathBuf> { std::env::var("HOME").ok().map(PathBuf::from) }
fn install_dir() -> Option<PathBuf> { Some(home_dir()?.join(".ai-office").join("app")) }

/// 번들된 Node 사이드카 (Contents/MacOS/node). 없으면 시스템 node
fn node_path() -> String {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let side = dir.join("node");
            if side.exists() { return side.to_string_lossy().to_string(); }
        }
    }
    for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] {
        if Path::new(p).exists() { return p.to_string(); }
    }
    "node".to_string()
}

/// 훅에 쓸 node: 번들 node 는 앱 번들 안에 있어 앱을 옮기거나 지우면 훅이 깨진다.
/// 그래서 ~/.ai-office/node 로 복사해 두고(크기가 다를 때만) 그 경로를 등록한다. 번들이 없으면(개발 실행) 시스템 node.
fn hook_node_path() -> String {
    let bundled = node_path();
    let is_bundle = bundled.contains("/Contents/MacOS/");
    if let (true, Some(home)) = (is_bundle, home_dir()) {
        let dest = home.join(".ai-office").join("node");
        let src = Path::new(&bundled);
        let same = match (std::fs::metadata(&dest), std::fs::metadata(src)) { (Ok(a), Ok(b)) => a.len() == b.len(), _ => false };
        if same { return dest.to_string_lossy().to_string(); }
        if let Some(parent) = dest.parent() { let _ = std::fs::create_dir_all(parent); }
        let tmp = dest.with_extension("tmp");
        if std::fs::copy(src, &tmp).is_ok() && std::fs::rename(&tmp, &dest).is_ok() { return dest.to_string_lossy().to_string(); }
        let _ = std::fs::remove_file(&tmp);
    }
    bundled
}

/// 앱 리소스의 server/ 폴더 (Contents/Resources/server)
fn bundled_server_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?.join("server");
    if dir.join("server.js").exists() { Some(dir) } else { None }
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for e in std::fs::read_dir(from)? {
        let e = e?;
        let target = to.join(e.file_name());
        if e.file_type()?.is_dir() { copy_dir(&e.path(), &target)?; } else { std::fs::copy(e.path(), &target)?; }
    }
    Ok(())
}

/// 리소스를 ~/.ai-office/app 에 설치(버전이 다를 때만) 하고 훅을 등록한다. 성공하면 설치 경로
fn ensure_installed(app: &AppHandle) -> Option<PathBuf> {
    let src = bundled_server_dir(app)?;
    let dest = install_dir()?;
    let version = app.package_info().version.to_string();
    let stamp = dest.join(".app-version");
    let current = std::fs::read_to_string(&stamp).ok().map(|s| s.trim().to_string());
    if current.as_deref() != Some(version.as_str()) || !dest.join("server.js").exists() {
        let _ = std::fs::remove_dir_all(&dest);
        copy_dir(&src, &dest).ok()?;
        let _ = std::fs::write(&stamp, format!("{version}\n"));
    }
    // 훅 등록 (멱등). 명령은 내장 node 절대경로를 쓴다
    let _ = Command::new(node_path())
        .arg(dest.join("scripts").join("install-hooks.js"))
        .arg("--app-dir").arg(&dest)
        .arg("--node").arg(hook_node_path())
        .arg("--port").arg(PORT.to_string())
        .stdout(Stdio::null()).stderr(Stdio::null())
        .status();
    Some(dest)
}

/// 서버 스크립트: 설치본 > 개발용 레포(app/src-tauri 기준 두 단계 위)
fn server_script(app: &AppHandle) -> Option<PathBuf> {
    if let Some(dir) = ensure_installed(app) { return Some(dir.join("server.js")); }
    if let Some(home) = home_dir() { let p = home.join(".ai-office/app/server.js"); if p.exists() { return Some(p); } }
    let here = std::env::current_dir().ok()?;
    for up in [here.clone(), here.join(".."), here.join("../..")] {
        let p = up.join("server.js");
        if p.exists() { return Some(p); }
    }
    None
}

fn spawn_server(app: &AppHandle) -> Option<Child> {
    if port_open(PORT) { return None; } // 이미 떠 있음 → 재사용
    let script = server_script(app)?;
    Command::new(node_path())
        .arg(script)
        .env("AI_OFFICE_PORT", PORT.to_string())
        .env("AI_OFFICE_WATCH_PARENT", "1") // 앱이 강제 종료돼도 서버가 스스로 끝나게
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .ok()
}

/// 답을 기다리는 세션 수 (tray 제목용)
fn waiting_count() -> Option<usize> {
    let resp = ureq::get(&format!("http://127.0.0.1:{PORT}/api/state")).timeout(Duration::from_millis(800)).call().ok()?;
    let v: serde_json::Value = resp.into_json().ok()?;
    Some(v["sessions"].as_array()?.iter().filter(|s| s["status"] == "waiting").count())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn run() {
    let child: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_exit = child.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(move |app| {
            // 1) 서버 기동 (이미 떠 있으면 재사용)
            *child.lock().unwrap() = spawn_server(&app.handle().clone());

            // 2) 메뉴바
            let open = MenuItem::with_id(app, "open", "AI Office 열기", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "창 숨기기", true, None::<&str>)?;
            let top = CheckMenuItem::with_id(app, "top", "항상 위에", true, false, None::<&str>)?;
            let reinstall = MenuItem::with_id(app, "reinstall", "훅 다시 설치", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료 (서버도 함께)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &hide, &top, &reinstall, &quit])?;
            let top_item = top.clone();
            let tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("icon"))
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip(format!("AI Office v{}", env!("CARGO_PKG_VERSION")))
                .on_menu_event(move |app, ev| match ev.id().as_ref() {
                    "open" => show_main(app),
                    "hide" => { if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); } }
                    "top" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let on = top_item.is_checked().unwrap_or(false);
                            let _ = w.set_always_on_top(on);
                        }
                    }
                    "reinstall" => { let _ = ensure_installed(app); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { .. } = ev { show_main(tray.app_handle()); }
                })
                .build(app)?;

            // 3) 대기 세션 수를 메뉴바 제목으로 (5초마다)
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                let n = waiting_count().unwrap_or(0);
                if let Some(t) = handle.tray_by_id("main") {
                    let _ = t.set_title(if n > 0 { Some(format!("🙋 {n}")) } else { None::<String> });
                }
                let _ = &tray;
                std::thread::sleep(Duration::from_secs(5));
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // 닫기 = 숨기기 (메뉴바에 남는다). 종료는 tray 메뉴에서
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("tauri build")
        .run(move |_app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(mut c) = child_for_exit.lock().unwrap().take() { let _ = c.kill(); }
            }
        });
}
