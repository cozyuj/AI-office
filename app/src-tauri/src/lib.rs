//! AI Office 데스크탑 껍데기: Node 서버를 띄우고 그 페이지를 창에 보여준다. 메뉴바(tray)에서 열기/숨기기/항상 위/종료.
use std::net::{SocketAddr, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_updater::{Update, UpdaterExt};

const PORT: u16 = 4777;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
/// Windows 에서 GUI 앱이 콘솔 프로그램(node)을 띄우면 검은 창이 뜬다 → CREATE_NO_WINDOW
fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    { cmd.creation_flags(0x0800_0000); }
    cmd
}

fn port_open(port: u16) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

use std::path::{Path, PathBuf};

fn home_dir() -> Option<PathBuf> { std::env::var("HOME").ok().or_else(|| std::env::var("USERPROFILE").ok()).map(PathBuf::from) }
const NODE_BIN: &str = if cfg!(windows) { "node.exe" } else { "node" };

/// 실행 파일 옆의 번들 Node 사이드카 (맥: Contents/MacOS/node, Windows: node.exe)
fn sidecar_node() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let side = exe.parent()?.join(NODE_BIN);
    if side.exists() { Some(side) } else { None }
}
fn install_dir() -> Option<PathBuf> { Some(home_dir()?.join(".ai-office").join("app")) }

/// 번들된 Node 사이드카. 없으면(개발 실행) 시스템 node
fn node_path() -> String {
    if let Some(side) = sidecar_node() { return side.to_string_lossy().to_string(); }
    for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] {
        if Path::new(p).exists() { return p.to_string(); }
    }
    "node".to_string()
}

/// 훅에 쓸 node: 번들 node 는 앱 번들 안에 있어 앱을 옮기거나 지우면 훅이 깨진다.
/// 그래서 ~/.ai-office/node 로 복사해 두고(크기가 다를 때만) 그 경로를 등록한다. 번들이 없으면(개발 실행) 시스템 node.
fn hook_node_path() -> String {
    let bundled = node_path();
    if let (Some(src), Some(home)) = (sidecar_node(), home_dir()) {
        let dest = home.join(".ai-office").join(NODE_BIN);
        let src = src.as_path();
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
    let _ = quiet(&mut Command::new(node_path()))
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
    quiet(&mut Command::new(node_path()))
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

/// 받아 둔 업데이트 (APP-11). 백그라운드에선 내려받아 서명 검증까지만 하고, 설치는 사용자가 '업데이트 적용' 을 누를 때 한다.
/// 실행 중인 앱 번들을 바로 바꾸면 서버가 내려가거나(맥), 묻지 않고 설치·재시작된다(Windows).
struct Pending { update: Update, bytes: Vec<u8> }
type PendingUpdate = Arc<Mutex<Option<Pending>>>;

/// 업데이트 확인 → 있으면 내려받아 보관. Ok(Some(버전)) 받아 둠, Ok(None) 최신, Err 확인 실패
async fn fetch_update(app: AppHandle, pending: PendingUpdate) -> Result<Option<String>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else { return Ok(None) };
    let version = update.version.clone();
    if pending.lock().unwrap().as_ref().map(|p| p.update.version == version).unwrap_or(false) { return Ok(Some(version)); } // 이미 받아 둠
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    *pending.lock().unwrap() = Some(Pending { update, bytes });
    Ok(Some(version))
}

// ---------- 메뉴바 아이콘 (APP-12) ----------
// 알릴 게 없으면 단색 템플릿(macOS 가 메뉴바 색에 맞춰 칠함). 알릴 게 있으면(답 기다리는 세션 · 받아 둔 업데이트)
// 카카오톡처럼 오른쪽 위에 빨간 점. 템플릿은 한 색으로만 칠해지므로 점이 있을 땐 다크/라이트에 맞춰 건물 색을 직접 칠한다.
const TRAY_PNG: &[u8] = include_bytes!("../icons/tray@2x.png");

fn tray_image(dot: bool, dark: bool) -> (tauri::image::Image<'static>, bool) {
    let base = tauri::image::Image::from_bytes(TRAY_PNG).expect("tray icon");
    let (w, h) = (base.width(), base.height());
    let mut px = base.rgba().to_vec();
    // Windows 트레이는 템플릿이 없고 작업 표시줄이 어두울 수도 밝을 수도 있어 브랜드 주황으로 칠한다
    let glyph: [u8; 3] = if cfg!(target_os = "macos") { if dark { [255, 255, 255] } else { [0, 0, 0] } } else { [0xe8, 0x68, 0x3a] };
    if !dot && cfg!(target_os = "macos") { return (base.to_owned(), true); }
    for p in px.chunks_exact_mut(4) { p[0] = glyph[0]; p[1] = glyph[1]; p[2] = glyph[2]; }
    if dot {
        // 오른쪽 위 빨간 점 (지름 ≈ 아이콘의 34%) + 둘레를 투명하게 비워 건물과 떨어져 보이게
        let r = w as f32 * 0.17;
        let (cx, cy) = (w as f32 - r - 0.5, r + 0.5);
        for y in 0..h {
            for x in 0..w {
                let d = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
                let i = ((y * w + x) * 4) as usize;
                if d < r + 2.5 { px[i + 3] = 0; }
                let a = (r + 0.5 - d).clamp(0.0, 1.0);
                if a > 0.0 { px[i] = 0xff; px[i + 1] = 0x3b; px[i + 2] = 0x30; px[i + 3] = (a * 255.0) as u8; }
            }
        }
    }
    (tauri::image::Image::new_owned(px, w, h), false)
}

/// Dock(작업 표시줄) 아이콘의 빨간 점 (APP-14): 메뉴바와 같은 조건, 숫자 없음.
/// macOS 는 Dock 배지(공백 한 칸이면 글자 없는 빨간 점), Windows 는 작업 표시줄 오버레이 아이콘
fn set_app_badge(app: &AppHandle, dot: bool) {
    let Some(w) = app.get_webview_window("main") else { return };
    #[cfg(target_os = "macos")]
    { let _ = w.set_badge_label(if dot { Some(" ".to_string()) } else { None }); }
    #[cfg(target_os = "windows")]
    {
        let img = if dot {
            let n: u32 = 32; let r = 13.0_f32; let c = n as f32 / 2.0;
            let mut px = vec![0u8; (n * n * 4) as usize];
            for y in 0..n { for x in 0..n {
                let d = ((x as f32 + 0.5 - c).powi(2) + (y as f32 + 0.5 - c).powi(2)).sqrt();
                let a = (r + 0.5 - d).clamp(0.0, 1.0);
                let i = ((y * n + x) * 4) as usize;
                if a > 0.0 { px[i] = 0xff; px[i + 1] = 0x3b; px[i + 2] = 0x30; px[i + 3] = (a * 255.0) as u8; }
            } }
            Some(tauri::image::Image::new_owned(px, n, n))
        } else { None };
        let _ = w.set_overlay_icon(img);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { let _ = (w, dot); }
}

fn system_dark(app: &AppHandle) -> bool {
    app.get_webview_window("main").and_then(|w| w.theme().ok()).map(|t| t == tauri::Theme::Dark).unwrap_or(true)
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
    let child_for_apply = child.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            // 1) 서버 기동 (이미 떠 있으면 재사용)
            *child.lock().unwrap() = spawn_server(&app.handle().clone());

            // 2) 메뉴바
            let open = MenuItem::with_id(app, "open", "AI Office 열기", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "창 숨기기", true, None::<&str>)?;
            let top = CheckMenuItem::with_id(app, "top", "항상 위에", true, false, None::<&str>)?;
            let reinstall = MenuItem::with_id(app, "reinstall", "훅 다시 설치", true, None::<&str>)?;
            let check = MenuItem::with_id(app, "check", "업데이트 확인", true, None::<&str>)?;
            let apply = MenuItem::with_id(app, "apply", "업데이트 적용 (다시 시작)", false, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료 (서버도 함께)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &hide, &top, &reinstall, &check, &apply, &quit])?;
            let top_item = top.clone();
            // 업데이트: 시작 10초 뒤 한 번, 그 뒤 6시간마다 확인해 내려받아 둔다. 받아 두면 '업데이트 적용' 이 켜지고 트레이 제목에 ⬆
            let pending: PendingUpdate = Arc::new(Mutex::new(None));
            let apply_item = apply.clone();
            let check_item = check.clone();
            let spawn_check = {
                let pending = pending.clone();
                let apply_item = apply_item.clone();
                let check_item = check_item.clone();
                move |app: AppHandle| {
                    let pending = pending.clone();
                    let apply_item = apply_item.clone();
                    let check_item = check_item.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = check_item.set_text("업데이트 확인 중…");
                        match fetch_update(app, pending).await {
                            Ok(Some(v)) => { let _ = apply_item.set_text(format!("v{v} 업데이트 적용 (다시 시작)")); let _ = apply_item.set_enabled(true); let _ = check_item.set_text("업데이트 확인"); }
                            Ok(None) => { let _ = check_item.set_text(format!("업데이트 확인 (최신 v{})", env!("CARGO_PKG_VERSION"))); }
                            Err(e) => { let _ = check_item.set_text(format!("업데이트 확인 실패 — 다시 시도 ({})", e.chars().take(40).collect::<String>())); }
                        }
                    });
                }
            };
            let pending_for_apply = pending.clone();
            let apply_for_menu = apply_item.clone();
            {
                let handle = app.handle().clone();
                let spawn_check = spawn_check.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(10));
                    loop { spawn_check(handle.clone()); std::thread::sleep(Duration::from_secs(6 * 60 * 60)); }
                });
            }
            let spawn_check_menu = spawn_check.clone();
            let tray = TrayIconBuilder::with_id("main")
                // 메뉴바용 단색 템플릿 아이콘 (창문·문이 투명한 건물). 컬러 앱 아이콘을 템플릿으로 쓰면 흰 네모로 뭉개진다
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray@2x.png")).expect("tray icon"))
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true) // 왼쪽·오른쪽 클릭 모두 메뉴 (APP-13). 창 열기는 메뉴의 'AI Office 열기'
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
                    "check" => spawn_check_menu(app.clone()),
                    "apply" => {
                        // 서버를 먼저 내리고 설치 → 다시 시작. 다시 시작한 앱이 새 서버 파일을 설치하고 서버를 띄운다.
                        // Windows 는 install() 이 설치 프로그램을 띄우고 앱을 끝낸다 (설치 뒤 자동 실행)
                        let Some(p) = pending_for_apply.lock().unwrap().take() else { return };
                        if let Some(mut c) = child_for_apply.lock().unwrap().take() { let _ = c.kill(); let _ = c.wait(); }
                        match p.update.install(&p.bytes) {
                            Ok(()) => app.restart(),
                            Err(e) => {
                                let _ = apply_for_menu.set_text(format!("업데이트 실패: {}", e.to_string().chars().take(50).collect::<String>()));
                                let _ = apply_for_menu.set_enabled(false);
                                *child_for_apply.lock().unwrap() = spawn_server(app); // 서버 되살리기
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // 3) 알림 표시 (5초마다): 답 기다리는 세션이나 받아 둔 업데이트가 있으면 아이콘에 빨간 점, 자세한 건 툴팁
            let handle = app.handle().clone();
            let pending_for_title = pending.clone();
            std::thread::spawn(move || {
                let mut last: Option<(bool, bool)> = None;
                let mut last_tip = String::new();
                loop {
                    let n = waiting_count().unwrap_or(0);
                    let update = pending_for_title.lock().ok().and_then(|p| p.as_ref().map(|p| p.update.version.clone()));
                    let dot = n > 0 || update.is_some();
                    let dark = system_dark(&handle);
                    if let Some(t) = handle.tray_by_id("main") {
                        if last != Some((dot, dark)) {
                            let (img, template) = tray_image(dot, dark);
                            let _ = t.set_icon_with_as_template(Some(img), template);
                            let _ = t.set_title(None::<String>);
                            if last.map(|(d, _)| d) != Some(dot) { set_app_badge(&handle, dot); } // Dock 도 메뉴바와 같이
                            last = Some((dot, dark));
                        }
                        let mut tip = format!("AI Office v{}", env!("CARGO_PKG_VERSION"));
                        if n > 0 { tip.push_str(&format!(" · 답 기다림 {n}")); }
                        if let Some(v) = &update { tip.push_str(&format!(" · v{v} 업데이트 준비됨")); }
                        if tip != last_tip { let _ = t.set_tooltip(Some(&tip)); last_tip = tip; }
                    }
                    let _ = &tray;
                    std::thread::sleep(Duration::from_secs(5));
                }
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
