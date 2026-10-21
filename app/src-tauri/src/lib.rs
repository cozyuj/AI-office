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

/// ~/.ai-office/app/server.js (npx 설치본) 또는 레포 루트의 server.js 를 찾는다
fn server_script() -> Option<std::path::PathBuf> {
    let home = std::env::var("HOME").ok().map(std::path::PathBuf::from)?;
    let installed = home.join(".ai-office/app/server.js");
    if installed.exists() { return Some(installed); }
    // 개발 중: app/src-tauri 에서 두 단계 위가 레포 루트
    let here = std::env::current_dir().ok()?;
    for up in [here.clone(), here.join(".."), here.join("../..")] {
        let p = up.join("server.js");
        if p.exists() { return Some(p); }
    }
    None
}

fn node_path() -> String {
    // PATH 에 node 가 없을 수 있어(GUI 앱) 흔한 위치를 함께 본다
    for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] {
        if std::path::Path::new(p).exists() { return p.to_string(); }
    }
    "node".to_string()
}

fn spawn_server() -> Option<Child> {
    if port_open(PORT) { return None; } // 이미 떠 있음 → 재사용
    let script = server_script()?;
    Command::new(node_path())
        .arg(script)
        .env("AI_OFFICE_PORT", PORT.to_string())
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
            *child.lock().unwrap() = spawn_server();

            // 2) 메뉴바
            let open = MenuItem::with_id(app, "open", "AI Office 열기", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "창 숨기기", true, None::<&str>)?;
            let top = CheckMenuItem::with_id(app, "top", "항상 위에", true, false, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료 (서버도 함께)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &hide, &top, &quit])?;
            let top_item = top.clone();
            let tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("icon"))
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("AI Office")
                .on_menu_event(move |app, ev| match ev.id().as_ref() {
                    "open" => show_main(app),
                    "hide" => { if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); } }
                    "top" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let on = top_item.is_checked().unwrap_or(false);
                            let _ = w.set_always_on_top(on);
                        }
                    }
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
