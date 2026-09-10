// frontend/src/styles/themeEngine.ts

export interface TintConfig {
  tintOpacity: number; // 0 to 100
  tintBrightness: number; // 0 to 60
  tintHex?: string; // e.g. "#D4121214"
}

export const DEFAULT_TINT: Required<TintConfig> = {
  tintOpacity: 83,
  tintBrightness: 18,
  tintHex: '#D4121214',
};

/**
 * Validates whether a hex color string is safe and valid (prevents CSS injection).
 */
export function isValidHexColor(hex: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex);
}

/**
 * Sanitizes hex color input by falling back to safe default.
 */
export function sanitizeHex(input?: string | null, fallback: string = '#121214'): string {
  if (!input) return fallback;
  return isValidHexColor(input) ? input : fallback;
}

/**
 * Sanitizes and clamps tint parameters, then applies them to document.documentElement.
 */
export function applyTintTokens(config: Partial<TintConfig>): void {
  if (typeof document === 'undefined') return;

  const rawOpacity = config.tintOpacity ?? DEFAULT_TINT.tintOpacity;
  const rawBrightness = config.tintBrightness ?? DEFAULT_TINT.tintBrightness;

  // Boundary clamping per T2-F10-02 and T2-F24-02
  const opacityPercent = Math.max(0, Math.min(100, rawOpacity));
  const brightness = Math.max(0, Math.min(60, rawBrightness));
  const opacityDecimal = Number((opacityPercent / 100).toFixed(2));

  // RGB derivation matching MainViewModel.UpdateBackgroundBrush()
  const r = Math.max(0, Math.min(255, brightness));
  const g = Math.max(0, Math.min(255, brightness));
  const b = Math.max(0, Math.min(255, brightness + 2));

  const root = document.documentElement;
  root.style.setProperty('--tint-opacity', `${opacityDecimal}`);
  root.style.setProperty('--tint-brightness', `${brightness}`);
  root.style.setProperty('--tint-r', `${r}`);
  root.style.setProperty('--tint-g', `${g}`);
  root.style.setProperty('--tint-b', `${b}`);
  root.style.setProperty('--tint-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--bg-tint-color', `rgb(${r}, ${g}, ${b})`);
  root.style.setProperty('--window-bg', `rgba(${r}, ${g}, ${b}, ${opacityDecimal})`);
  root.style.setProperty('--window-bg-elevated', `rgba(${r + 10}, ${g + 10}, ${b + 12}, ${opacityDecimal})`);
}

/**
 * Formats a valid 8-digit ARGB hex string matching WPF SolidColorBrush for live display.
 */
export function formatWpfHex(opacityPercent: number, brightness: number): string {
  const alpha = Math.max(0, Math.min(255, Math.round((opacityPercent * 255.0) / 100.0)));
  const r = Math.max(0, Math.min(255, brightness));
  const g = Math.max(0, Math.min(255, brightness));
  const b = Math.max(0, Math.min(255, brightness + 2));

  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(alpha)}${toHex(r)}${toHex(g)}${toHex(b)}`;
}
