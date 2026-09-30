# Agent Context & Workflow Rules



## Execution Rules for Agents
- **STRICT ANTI-OVERANALYZING & IMMEDIATE ACTION INVARIANT (HARD ENFORCEMENT):**
  - **Tool Call Hard Limit**: When investigating a bug or UI issue, you are allowed a MAXIMUM of 2-3 targeted `view_file` calls total before you MUST apply edits with `replace_file_content`. Wandering through 4+ files without editing is strictly forbidden.
  - **Zero Exploratory Reading**: Never read architectural specs, mutation pipelines, stores, CSS, or backend handlers unless explicitly named or directly causing a syntax/runtime crash.
  - **Single Read Invariant**: NEVER re-read or inspect the same file or line range multiple times. If context has the lines, use them immediately.
  - **75% Confidence Trigger**: The instant a plausible cause or UI target line is located, STOP all analysis, apply the surgical edit immediately, run verification, and output results.
  - Do NOT pause, generate explanations, or write speculative plans. Edit -> Verify -> Done.
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
