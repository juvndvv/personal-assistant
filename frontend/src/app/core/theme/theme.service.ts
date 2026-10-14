import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'finanzas.theme';
export const TRANSPARENCY_STORAGE_KEY = 'finanzas.transparency';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const REDUCED = 'reduced';
const THEME_COLOR_TOKEN = '--theme-color';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly storage = safeStorage(this.window);
  private readonly darkScheme = this.window?.matchMedia?.(DARK_SCHEME_QUERY);
  private readonly systemDark = signal(this.darkScheme?.matches ?? false);
  private readonly preferenceState = signal(parsePreference(this.storage.read(THEME_STORAGE_KEY)));
  private readonly reducedState = signal(this.storage.read(TRANSPARENCY_STORAGE_KEY) === REDUCED);
  private readonly defaultThemeColors = new Map<HTMLMetaElement, string>();

  readonly preference = this.preferenceState.asReadonly();
  readonly reducedTransparency = this.reducedState.asReadonly();
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preferenceState();
    if (preference === 'system') {
      return this.systemDark() ? 'dark' : 'light';
    }
    return preference;
  });

  constructor() {
    this.darkScheme?.addEventListener('change', (event) => {
      this.systemDark.set(event.matches);
      this.apply();
    });
    this.apply();
  }

  setPreference(preference: ThemePreference): void {
    this.preferenceState.set(preference);
    this.storage.write(THEME_STORAGE_KEY, preference === 'system' ? null : preference);
    this.apply();
  }

  setReducedTransparency(reduced: boolean): void {
    this.reducedState.set(reduced);
    this.storage.write(TRANSPARENCY_STORAGE_KEY, reduced ? REDUCED : null);
    this.apply();
  }

  private apply(): void {
    const root = this.document.documentElement;
    root.classList.toggle('dark', this.resolved() === 'dark');
    if (this.reducedState()) {
      root.setAttribute('data-transparency', REDUCED);
    } else {
      root.removeAttribute('data-transparency');
    }
    this.syncThemeColor(root);
  }

  private syncThemeColor(root: HTMLElement): void {
    const metas = Array.from(
      this.document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
    );
    for (const meta of metas) {
      if (!this.defaultThemeColors.has(meta)) {
        this.defaultThemeColors.set(meta, meta.content);
      }
    }
    const forced = this.preferenceState() !== 'system';
    const color = forced
      ? (this.window?.getComputedStyle(root).getPropertyValue(THEME_COLOR_TOKEN).trim() ?? '')
      : '';
    for (const meta of metas) {
      meta.content = color !== '' ? color : (this.defaultThemeColors.get(meta) ?? meta.content);
    }
  }
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return PREFERENCES.some((preference) => preference === value);
}

function parsePreference(raw: string | null): ThemePreference {
  return isThemePreference(raw) ? raw : 'system';
}

interface SafeStorage {
  read(key: string): string | null;
  write(key: string, value: string | null): void;
}

function safeStorage(window: Window | null): SafeStorage {
  return {
    read(key) {
      try {
        return window?.localStorage.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        if (value === null) {
          window?.localStorage.removeItem(key);
        } else {
          window?.localStorage.setItem(key, value);
        }
      } catch {
        return;
      }
    },
  };
}
