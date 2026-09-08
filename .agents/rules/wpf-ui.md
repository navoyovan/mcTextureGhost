---
trigger: model_decision
description: Invariants, styling rules, and API differences for WPF-UI (4.x) and Windows 11 Fluent desktop applications.
---

# WPF-UI 4.x & Modern Windows 11 Rules

## 1. ControlAppearance & Property Invariants
- **Subtle Buttons**: In WPF-UI 4.x, the subtle button appearance is `Appearance="Transparent"`. Never use `Appearance="Subtle"` (which is WinUI 3 C++/C# only and throws a runtime `FormatException`).
- **TextBox**: Do NOT use `IsClearButtonEnabled="True"` on `ui:TextBox`. Use `PlaceholderText` and `<ui:TextBox.Icon>` instead.
- **XAML Casing**: XAML properties are strictly case-sensitive. Always verify capitalization (e.g., `VerticalAlignment="Center"`, never `verticalAlignment`).

## 2. Windows 11 TitleBar & Caption Controls
- `ui:TitleBar` defaults `ButtonsForeground` to `#FF000000` (Black). On dark theme / Mica windows, always explicitly set `ButtonsForeground="#D0D0D0"` or `ApplicationTheme="Dark"`.
- To avoid thick Windows 10 legacy wireframe caption buttons, provide an application-level `TitleBarButton` style using sleek 1px stroke Fluent geometry (10px line minimize, 10x10 rounded square maximize, 10px thin cross close).
- Standard title bar height on Windows 11 is `36px` (or `32px`), not `42px`+.

## 3. Assembly Reflection in Windows Sandbox
- Never run `Add-Type` in PowerShell 5.1 to reflect .NET 8 assemblies (fails due to CLR mismatch).
- To inspect types or properties in .NET 8 binaries, execute a short one-file console app targeting `net8.0-windows` via `dotnet run`.
