# AI Office

[한국어](README.md) · English

An isometric office that shows what your Claude Code sessions are doing, in real time. Every Claude Code session in your terminal sends hook events; each session becomes a character that walks around the office. Reading a file sends them to the **Library**, running a command puts them in front of the **Server Room** racks, thinking keeps them at their desk **pondering**, and delegating work makes a subagent arrive by **Elevator**. Each git project gets its own floor, and every session of that project shares the floor. A session waiting for your answer raises a hand at **My Desk**, and you also get a browser notification, a chime and a tab-title badge.

![AI Office overview](docs/screenshots/fe-30-overview.jpg)

## Install

**macOS (Apple Silicon), as an app:** ⬇️ **[AI-Office-mac-arm64.dmg](https://github.com/cozyuj/AI-office/releases/latest/download/AI-Office-mac-arm64.dmg)** (about 40 MB, Node bundled, always the latest), or `brew install --cask cozyuj/tap/ai-office`. Drag `AI Office.app` to Applications and **right-click → Open** the first time. See [Menu bar app](#menu-bar-app-tauri) below.

**Windows (x64), as an app:** ⬇️ **[AI-Office-windows-x64-setup.exe](https://github.com/cozyuj/AI-office/releases/latest/download/AI-Office-windows-x64-setup.exe)**. If SmartScreen warns, choose "More info → Run anyway".

**Everything else (Intel Mac · Linux · any OS with Node 18+), the web version:**

```bash
npx claude-ai-office
```

(Straight from GitHub instead of npm: `npx github:cozyuj/AI-office`, same behavior.)

That one line (1) copies the app to `~/.ai-office/app`, (2) registers hooks in `~/.claude/settings.json`, then (3) starts the server and opens your browser. Run the same command again later to start the server; it also updates the installed copy when the package changed. Hooks apply to Claude Code sessions **started after** installation.

### `ai-office` subcommands

| Command | What it does |
|---|---|
| `npx claude-ai-office` | `up` = install + install-hooks + start + open browser |
| `… install [--force]` | Copy the app to `~/.ai-office/app` (a stable path independent of the npx cache) |
| `… install-hooks` | Register hooks in `~/.claude/settings.json` (idempotent, backs up the file) |
| `… uninstall-hooks` | Remove the hooks |
| `… start [--port N] [--no-open]` | Start only the server; if one is already running, open it |
| `… demo` | Fill the office with fake sessions (same as ⚙️ Settings → Demo) |
| `… doctor` | Check Node version, hooks, install, port, journal size and hook port |
| `… compact` | Compact the event journal right now (the server also does this hourly) |

### Hooks

`scripts/install-hooks.js` registers `node hooks/emit.js` for Claude Code's hook events (SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Notification, Stop, SubagentStart, SubagentStop, PreCompact). It needs only Node, no shell or curl (Windows included), and gives up silently within one second when the server is down, so Claude is never blocked.

### Port

The default port is `4777`. To change it, the server and the hooks must agree:

```bash
npx claude-ai-office install-hooks --port 4800   # hooks → 4800
npx claude-ai-office start --port 4800           # server → 4800
```

A mismatch shows a yellow banner in the UI and in the `hook port` line of `doctor`. From a clone:

```bash
git clone https://github.com/cozyuj/AI-office.git && cd AI-office
node bin/ai-office.js            # or: npm run install-hooks && npm start
```

## The screen

![Café and terrace](docs/screenshots/fe-30-cafe-terrace.jpg)

| Area | Contents |
|---|---|
| **Left: Floors** | One floor per git project (repository root). Worktrees share the floor and show their branch (⎇). Opening a floor lists its sessions with `waiting` and `viewing` badges. By default only the selected floor is open; **Expand all ↔ Collapse all** in the header opens or closes every floor's session list at once (clicking a floor while all are collapsed opens that floor; remembered in the browser). 🎨 on the selected floor picks that floor's interior preset (Warm Wood · Cool Gray · Mint · Lavender · Sand · Pastel; assigned automatically by default). "Follow the latest session" (`A`) moves the selection to the most recently active session; when it is off, the last floor and session you looked at are restored next time |
| **Center: Office** | Drag to pan, wheel or buttons to zoom, `⟲` to reset, pinch on touch screens. Click a character to select its session; hover for a tooltip (current action, target file, prompt, branch, path). 📍 **Follow** (`F`) keeps the camera on the selected session's Claude. 🏢 **Building view** (`O`) appears when there are two or more floors |
| **Right panel** | Session card (project path · session id · character name · copy the resume command · 🗑 dismiss ended sessions), people in the office (room · speech bubble · elapsed time), activity log (search with `/`, selected session only), legend (click the title to collapse) |

**Resume** on the session card copies `cd "<project folder>" && claude --resume <session id>` to the clipboard, so you can continue a session from the terminal. Sessions idle for two hours are retired automatically; **🗑 Dismiss** removes a finished session from the list right away.

### Who goes where

| Tool | Room | Speech bubble |
|---|---|---|
| Read, Grep, Glob | 📖 Library | `reading server.js`, `searching "TODO"` |
| Edit, Write | ✏️ Dev Room | `editing app.js` |
| Bash | 🖥️ Server Room | `running npm test` |
| WebSearch, WebFetch, MCP tools | 🌐 Research Room | `searching "tauri vs electron"` |
| Agent, TodoWrite, Skill, Plan | 🤝 Meeting Room | `delegating: find API endpoints` |
| AskUserQuestion, permission prompts | 🙋 My Desk | `I have a question`, `need permission` |
| Stop (end of turn) | ☕ Lounge · Café · Terrace (one rest room per session) | `resting`, `having coffee`, `getting some air` |
| SubagentStart / Stop | 🛗 Elevator | arriving / leaving |

Each session gets one rest room, chosen from a hash of its session id, so every browser sees the same session in the same room. The café (a glass-walled room with window seats) and the terrace (deck, parasols, benches) are places to rest, not rooms tied to a tool. With **Liveliness** on (⚙️ Settings), resting characters wander between spots in their room (counter, window, table, parasol, bench, railing, sofa, vending machine) every 10–30 seconds with bubbles like `☕ a latte`, `🪟 looking outside`, `🌤️ nice breeze`; with it off they stay put.

### A different office on every floor

Each floor (= project) is assigned an **interior preset** automatically (hash of the floor path, avoiding its neighbours). A preset sets not only the palette but the **layout**: the nine work rooms (Library, Dev Room, Research Room, Meeting Room, Lounge, Server Room, My Desk, Lobby, Elevator) sit in different places, and the two rest facilities change.

| Preset | Facilities |
|---|---|
| 🪵 Warm Wood · 🍬 Pastel | Café · Terrace |
| 🩶 Cool Gray | Seminar Room · Studio |
| 🌿 Mint | Gym · Rooftop Garden |
| 💜 Lavender | Book Lounge · Game Room |
| 🏜️ Sand | Canteen · Nap Room |

A session's rest room (café or terrace) becomes that floor's facility: on a Mint floor the character goes to the Gym (`🏃 working out`) and the log reads `✅ … → 🏃 Gym`. Press **🎨** on the selected floor to pick a preset by hand; the choice is stored on the server (`~/.ai-office/floor-styles.json`) so every browser sees the same floor (`Auto` restores the automatic choice). Building view shows the different layouts too.

![Different office on every floor](docs/screenshots/fe-35-overview.jpg)

Subagents wear blue hard hats and are named after the `description` given to the Agent tool. You (`me`) sit at My Desk, and Claude comes over when it has a question or needs permission.

## Settings and shortcuts

Open **⚙️ Settings** in the header. Everything here is stored in this browser only (localStorage).

| Setting | Meaning | Key |
|---|---|---|
| Bubbles | Show speech bubbles for **all** sessions or only the **selected** one | `B` |
| Browser notifications | OS notification when Claude asks a question or waits for permission. Asks for browser permission the first time | |
| Waiting chime | A short sound when a session starts waiting for you. Click once so the browser allows audio | `S` |
| Sound scope | **Waiting only** (high two-tone) or **also failures and session end** (low two-tone) | |
| Liveliness | Resting characters wander and idle animations | |
| Theme | Light / dark | `T` |
| Demo | Four fake sessions on separate `(demo)` floors | `D` |
| Character looks | Opens the customizer (below) | |
| Daylight | Window, terrace and room lighting follow the real clock: morning (06–10), day (10–17), evening (17–20), night (20–06). Can be fixed to one period or turned off | |
| Floor interior | Interior preset of the floor you are viewing | |
| Language | 한국어 / English | |
| Shortcuts | Keyboard shortcut panel | `?` |

Shortcuts work when no input field has focus.

| Key | Action |
|---|---|
| `0` – `9` | Go to floor number (7 → 7F; for 12F press `1` then `2`) |
| `←` `→` (or `↑` `↓`) | Previous / next floor |
| `F` | 📍 Follow the selected session's Claude |
| `A` | Follow the latest session automatically |
| `O` | 🏢 Building view |
| `D` | Demo on/off |
| `B` | Bubbles: all / selected |
| `S` | Waiting chime |
| `T` | Light / dark theme |
| `/` | Focus the log search |
| `Esc` | Close shortcut panel · customizer · settings · building view → clear search → stop following (one step at a time) |
| `?` | Shortcut panel |

## Character looks and names

![Customizer](docs/screenshots/fe-30-customize.jpg)

⚙️ Settings → **Character looks** customizes four targets separately: **me / default Claude / default subagent / the Claude of the session you are viewing**.

- **10 presets**: Developer · Suit · Researcher · Casual · Artist · Wizard · King · Robot · Cat · Bear. Pick one, then tweak the parts.
- **4 body types**: human · robot · cat · bear. The skin (fur, metal) palette follows the body.
- **Parts**: skin, hair (12 styles + color), top (8 styles + color; `auto` uses the session color), bottom (pants · shorts · skirt), shoes, glasses (round · square · sunglasses · goggles · monocle), hats (cap · beanie · beret · headband · bucket hat · top hat · wizard · crown …), extras (headphones · scarf · badge · earring · bow tie · beard · mask …).
- 🎲 random, ↺ reset, 🗑 delete the saved look. Saved in this browser only.

**Names per session**: every session's character gets an automatic nickname (Alex, Sam, Max, Leo, Mia, Zoe, …). Rename it in the "Character" row of the session card or in the customizer (🎲 draws another nickname; clearing the field goes back to automatic). The log and tooltips use that name. The server still calls it `Claude`; only the screen changes.

## Building view

![Building view](docs/screenshots/fe-30-building.jpg)

With two or more floors, 🏢 **Building view** (`O`) appears in the header. Floors are stacked like a building, each with a mini office, character dots and the session count and status (`waiting` / `working` / `thinking` / `quiet`). The interior preset of each floor shows in its mini office. Click a floor to enter it; `Esc` or the same button closes the view.

## Menu bar app (Tauri)

A resident app that shows the web UI in a window. It starts the Node server itself (or reuses one that is already running) and lives in the menu bar / system tray with Open, Hide, Always on top, Reinstall hooks, Check for updates and Quit. When sessions are waiting for you, the menu bar shows `🙋 n`. Closing the window hides it; Quit stops the server too. Node is bundled: on first launch the app copies the server files to `~/.ai-office/app` and the Node binary to `~/.ai-office/node`, then registers the hooks, so moving or deleting the app does not break them.

**Updates**: the app checks for a new version 10 seconds after launch and every 6 hours and only **downloads** it in the background (signature verified), then shows ⬆ in the menu bar and enables "Apply vX update (restart)". Applying stops the server, installs and restarts; nothing is installed without asking and the running app is never replaced underneath you. "Check for updates" in the menu shows whether you are up to date or why a check failed. Releases are built by GitHub Actions for macOS (Apple Silicon) and Windows (x64) and signed for the updater.

> **Download**: [macOS AI-Office-mac-arm64.dmg](https://github.com/cozyuj/AI-office/releases/latest/download/AI-Office-mac-arm64.dmg) · [Windows AI-Office-windows-x64-setup.exe](https://github.com/cozyuj/AI-office/releases/latest/download/AI-Office-windows-x64-setup.exe) (always the latest; older versions in [Releases](https://github.com/cozyuj/AI-office/releases)). The macOS app is not notarized: **right-click → Open** the first time; on macOS 15+ use System Settings → Privacy & Security → **Open Anyway**, and if it still says "damaged", run `xattr -dr com.apple.quarantine "/Applications/AI Office.app"` once. To build it yourself:

```bash
npm run app:dev      # dev run (Rust toolchain + Xcode CLT / MSVC build tools, first build takes minutes)
npm run app:build    # .app / .dmg / .exe under app/src-tauri/target/release/bundle/
```

`scripts/fetch-node.js` downloads the Node LTS binary and bundles it as a sidecar; the server files are app resources. A dev run without the bundle falls back to the system `node` and the repository's `server.js`.

## Architecture

```
Claude Code session ─hooks─▶ hooks/emit.js ─POST /hook─▶ server.js ─SSE /events─▶ public/ (canvas)
```

- `server.js` receives hooks, applies the state machine, relays SSE, serves static files, starts/stops the demo (`/api/demo/start|stop`), dismisses sessions (`DELETE /api/sessions/:id`)
- `lib/normalize.js` slims hook payloads and maps tools to rooms and bubbles
- `lib/state.js` floor/session/character state machine, `lib/project.js` cwd → git repository, branch, worktree
- `lib/journal.js` JSONL event journal (`~/.ai-office/events.jsonl`), replayed on start, compacted hourly
- `public/js/scene/*` isometric map, furniture, characters (`avatar.js`), A*, camera, daylight (`daylight.js`), floor styles (`floorStyle.js`)
- `public/js/overview.js` building view, `customize.js` customizer, `names.js` per-session names, `panels.js` side panels, `i18n.js` language
- `bin/ai-office.js` CLI, `scripts/install-hooks.js` hook registration, `scripts/demo.js` demo

Zero dependencies, no bundler. Design notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (Korean), technical overview: [docs/AI-Office-소개.html](docs/AI-Office-소개.html) (Korean).

## Development

```bash
npm test                      # node --test (state machine · pathfinding · looks · names · CLI · server · smoke …)
AI_OFFICE_PORT=4799 npm start # another port (hooks must be registered for the same port)
npm run demo                  # push fake sessions into a running server (DEMO_SPEED=3 for faster)
```

Versioning: bug fixes and docs bump patch, features bump minor, breaking changes bump major. One command updates all four files (package.json, app/package.json, tauri.conf.json, Cargo.toml):

```bash
npm run bump:patch   # 0.24.0 → 0.24.1
npm run bump:minor   # 0.24.0 → 0.25.0
```

Releases: push a tag `vX.Y.Z` and GitHub Actions builds the macOS and Windows apps, uploads them to the release with the updater manifest and stable-named copies, then installs and launches the Windows build on a runner to check the server and hooks. Tests run on Ubuntu, Windows and macOS on every push and pull request.

Workflow: create a GitHub issue named `[FE-30]`, `[BE-13]`, `[APP-03]` (FE/BE/APP), branch from `main` as `feature/FE-30`, and report results, tests and screenshots as issue comments.

## License

MIT
