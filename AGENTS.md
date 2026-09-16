# Antigravity Agent Context & Workflow Rules

## Project Bootstrapping Hierarchy (On-Demand Reference)
Consult these project specification files **only when relevant** to the task at hand. Do NOT sequentially read all files on every turn or loop through them before taking action:

1. **`ARCHITECTURE_ESSENTIALS.md`** (High-Level Cheat Sheet)
   - **When to read:** First-stop quick reference for tech choices, file locations, IPC syntax, and build commands.
2. **`PRD.md`** (Product Requirements)
   - **When to read:** Only when designing new user-facing features or clarifying product intent.
3. **`ARCHITECTURE.md`** (Full Technical Architecture)
   - **When to read:** Only when building complex data pipelines, multi-model state schemas, or deep IPC refactors.
4. **`RISKS_AND_EDGE_CASES.md`** (Failure Prevention)
   - **When to read:** Only when handling file locks, DWM window hooks, or raw Bedrock polymorphic JSON.
5. **`.agents/rules/entity-workspace.md`** (Entity & 3D Geometry Invariants)
   - **When to read:** Only when modifying Bedrock `.geo.json` parsers, bone hierarchies, Three.js box UVs, or EntityWorkspace.
6. **`AGENTS.md`** (System Instructions & Workflow - THIS FILE)
   - **Scope:** Execution rules, code style, build safety invariants.

---

## Execution Rules for Antigravity Agents
- **Strict Anti-Looping & Action Invariant:**
  - **NEVER** loop across files, re-read documentation files, or repeatedly call `view_file` on the same file/lines in an execution turn.
  - **Single Read Hard Limit:** Inspect any file or snippet at most ONCE. If you already have the lines in context or just viewed them, immediately apply edits via `replace_file_content` instead of calling `view_file` again.
  - Read **only** the single most relevant file (or section) needed for the current prompt.
  - When the user asks for a UI tweak, bug fix, or feature, immediately inspect the target code and apply the fix. Do not circle across unrequested documents.
  - Do NOT pause or generate formal planning artifacts (`implementation_plan.md`) unless the user explicitly asks for a plan or proposal first.
- **Context Efficiency:** Never read `ARCHITECTURE.md` when `ARCHITECTURE_ESSENTIALS.md` has the answer.
- **Single Source of Truth:** Tool-specific config files must only reference `AGENTS.md` and `.agents/rules/`.

---

### 1. Build Verification & Process Preservation Invariants
- **Frontend-Only Scope (STRICT: NO dotnet build, NEVER kill McTextureGhost processes):**
  - When changes are strictly within `frontend/` (`*.tsx`, `*.ts`, `*.module.css`, `*.json`, etc.):
    - **DO NOT** run `dotnet build`.
    - **NEVER** kill running `McTextureGhost` processes (`Stop-Process`). The user is actively running/testing the application with WebView2 live reload.
    - Verify frontend changes ONLY via:
      ```powershell
      # Inside frontend/ directory:
      node node_modules/typescript/bin/tsc --noEmit
      node node_modules/vite/bin/vite.js build
      ```
- **C# / Native Backend Scope (dotnet build only when needed):**
  - ONLY run `dotnet build` when backend files (`*.cs`, `*.xaml`, `*.csproj`) are actually created or modified.
  - If (and only if) running `dotnet build` fails due to executable file locks (`MSB3021` / `MSB3027`), terminate the locking instance before rebuilding:
    ```powershell
    Get-Process McTextureGhost -ErrorAction SilentlyContinue | Stop-Process -Force
    ```
- **WPF-UI 4.x Invariants:**
  - Subtle buttons: Use `Appearance="Transparent"` (never `Appearance="Subtle"`).
  - TitleBar Caption Buttons: When replacing `TitleBarButton` `ControlTemplate`, always set `Property="CommandParameter"` to `{x:Static ui:TitleBarButtonType.<Type>}` to avoid `ElementNotEnabledException`.
  - Atomic Event Synchronization: Never add XAML event attributes without the matching code-behind handler in the same edit.

### 2. Frontend / Vite / WebView2 Execution Guardrails
- **Direct Binary Invocation:**
  Avoid relying on `npm` or `npx` wrappers for bundling or type checking in sandboxed PowerShell environments. Prefer invoking installed binaries directly:
  ```powershell
  # Inside frontend/ directory:
  node node_modules/typescript/bin/tsc --noEmit
  node node_modules/vite/bin/vite.js build
  ```
- **Styling Invariant:**
  Strictly NO Tailwind CSS. All styling must use standard `*.module.css` and CSS variables.
- **Typography:**
  Fonts `Syne`, `Press Start 2P`, and system `Consolas`/`Segoe UI Variable` must be preserved per design tokens in `frontend/src/styles/`.
