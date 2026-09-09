---
trigger: model_decision
description: Invariants, styling rules, build safety guardrails, and API differences for WPF-UI (4.x) and Windows 11 Fluent desktop applications.
---

# WPF-UI 4.x & Modern Windows 11 Rules

## 1. ControlAppearance & Property Invariants
- **Subtle Buttons**: In WPF-UI 4.x, the subtle button appearance is `Appearance="Transparent"`. Never use `Appearance="Subtle"` (which is WinUI 3 C++/C# only and throws a runtime `FormatException`).
- **TextBox**: Do NOT use `IsClearButtonEnabled="True"` on `ui:TextBox`. Use `PlaceholderText` and `<ui:TextBox.Icon>` instead.
- **XAML Casing**: XAML properties are strictly case-sensitive. Always verify capitalization (e.g., `VerticalAlignment="Center"`, never `verticalAlignment`).
- **CornerRadius**: Standard WPF `Button` controls do NOT have a `CornerRadius` property. Use WPF-UI's styled buttons, a `Border` wrapper, or custom `ControlTemplate`.

## 2. Windows 11 TitleBar & Caption Controls
- `ui:TitleBar` defaults `ButtonsForeground` to `#FF000000` (Black). On dark theme / Mica windows, always explicitly set `ButtonsForeground="#D0D0D0"` or `ApplicationTheme="Dark"`.
- To avoid thick Windows 10 legacy wireframe caption buttons, provide an application-level `TitleBarButton` style using sleek 1px stroke Fluent geometry (10px line minimize, 10x10 rounded square maximize, 10px thin cross close).
- **TitleBarButton CommandParameter Invariant**: When replacing or customizing the `TitleBarButton` `ControlTemplate`, you MUST set `Property="CommandParameter"` to `{x:Static ui:TitleBarButtonType.<Type>}` in each `ButtonType` trigger (Minimize, Maximize, Restore, Close). If omitted, `CommandParameter` defaults to `null`, `RelayCommand<TitleBarButtonType>.CanExecute(null)` returns `false`, WPF coerces `IsEnabled="False"`, and clicking the button throws a fatal `System.Windows.Automation.ElementNotEnabledException`.
- **TitleBarButton Hover Highlighting & Non-Client Area**: In non-client caption areas, WPF's `IsMouseOver` property NEVER triggers because DWM handles non-client hit testing. Instead, WPF-UI's `HwndSourceHook` intercepts `WM_NCMOUSEMOVE` and calls `TitleBarButton.Hover()`, which programmatically sets `Background = MouseOverBackground` and `RenderButtonsForeground = MouseOverButtonsForeground`. Therefore:
  - NEVER set `ButtonsBackground="Transparent"` on `<ui:TitleBar>` (it binds `MouseOverBackground` to transparent, completely suppressing the hover highlight). Instead set `ButtonsBackground="#2EFFFFFF"`.
  - In `TitleBarButton` styles, set `<Setter Property="MouseOverBackground" Value="#2EFFFFFF" />` and `<Setter Property="MouseOverButtonsForeground" Value="#FFFFFF" />`.
  - In the button's `ControlTemplate`, bind `IconPath.Stroke` to `{TemplateBinding RenderButtonsForeground}` so the icon stroke illuminates to `#FFFFFF` on hover.
- Standard title bar height on Windows 11 is `36px` (or `32px`), not `42px`+.

## 3. Build Safety & Zero-Error Compilation Rules
- **Executable File Locks (MSB3021 / MSB3027)**:
  - If the application was launched for testing or is running in the background, `dotnet build` will fail after 10 retries because Windows locks `McTextureGhost.exe`.
  - Before running `dotnet build`, ensure previous running instances are terminated (e.g., via `Get-Process McTextureGhost -ErrorAction SilentlyContinue | Stop-Process -Force`).
  - If MSB3021/MSB3027 occurs, do NOT assume code is broken; kill the locking process and re-run.
- **Atomic XAML Event Synchronization (CS1061)**:
  - Never add an event attribute in XAML (e.g., `Click="Btn_Click"`, `MouseLeftButtonDown="Grip_MouseDown"`) without adding the matching method signature to the code-behind (`.xaml.cs`) in the same edit turn before building.
- **Mandatory Namespace Verification (CS0246 / CS0103)**:
  - When introducing input handling (`MouseButtonEventArgs`, `KeyEventArgs`, `Cursor`, `Mouse`), ensure `using System.Windows.Input;` is present.
  - When using colors/brushes (`Brush`, `Color`, `SolidColorBrush`), ensure `using System.Windows.Media;` is present.
  - When using LINQ operations (`.Select()`, `.Where()`, `.Any()`), ensure `using System.Linq;` is present.

## 4. Assembly Reflection in Windows Sandbox
- Never run `Add-Type` in PowerShell 5.1 to reflect .NET 8 assemblies (fails due to CLR mismatch).
- To inspect types or properties in .NET 8 binaries, execute a short one-file console app targeting `net8.0-windows` via `dotnet run`.
  - When creating a scratch project, run `dotnet new console -f net8.0` (not `net8.0-windows` which CLI rejects), then edit the `.csproj` to set `<TargetFramework>net8.0-windows</TargetFramework>` and `<UseWPF>true</UseWPF>`.
  - Ensure only one file contains top-level statements to prevent CS8802.
