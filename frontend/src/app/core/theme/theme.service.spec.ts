import { TestBed } from '@angular/core/testing';
import {
  DARK_SCHEME_QUERY,
  THEME_STORAGE_KEY,
  TRANSPARENCY_STORAGE_KEY,
  ThemeService,
} from './theme.service';

interface FakeMediaQuery {
  list: MediaQueryList;
  change(matches: boolean): void;
}

function fakeDarkScheme(initiallyDark: boolean): FakeMediaQuery {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const list = {
    matches: initiallyDark,
    media: DARK_SCHEME_QUERY,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
  return {
    list,
    change(matches) {
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    },
  };
}

function addThemeColorMetas(): HTMLMetaElement[] {
  return ['light', 'dark'].map((scheme) => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.media = `(prefers-color-scheme: ${scheme})`;
    meta.content = scheme === 'light' ? 'light-default' : 'dark-default';
    document.head.appendChild(meta);
    return meta;
  });
}

describe('ThemeService', () => {
  const root = document.documentElement;
  let scheme: FakeMediaQuery;
  let metas: HTMLMetaElement[];

  function setup(initiallyDark = false): ThemeService {
    scheme = fakeDarkScheme(initiallyDark);
    vi.spyOn(window, 'matchMedia').mockImplementation(() => scheme.list);
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    localStorage.clear();
    root.classList.remove('dark');
    root.removeAttribute('data-transparency');
    root.style.removeProperty('--theme-color');
    metas = addThemeColorMetas();
  });

  afterEach(() => {
    metas.forEach((meta) => meta.remove());
    vi.restoreAllMocks();
  });

  it('follows the system scheme by default', () => {
    const theme = setup(true);

    expect(theme.preference()).toBe('system');
    expect(theme.resolved()).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('reacts to system scheme changes while on system', () => {
    const theme = setup(false);
    expect(root.classList.contains('dark')).toBe(false);

    scheme.change(true);

    expect(theme.resolved()).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('forces a theme, persists it and ignores the system scheme', () => {
    const theme = setup(true);

    theme.setPreference('light');
    scheme.change(true);

    expect(theme.resolved()).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('restores the stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    const theme = setup(false);

    expect(theme.preference()).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('falls back to system for an unknown stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');

    expect(setup(false).preference()).toBe('system');
  });

  it('forgets the stored preference when going back to system', () => {
    const theme = setup(false);
    theme.setPreference('dark');

    theme.setPreference('system');

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('toggles reduced transparency on the root element and persists it', () => {
    const theme = setup(false);

    theme.setReducedTransparency(true);
    expect(root.getAttribute('data-transparency')).toBe('reduced');
    expect(localStorage.getItem(TRANSPARENCY_STORAGE_KEY)).toBe('reduced');

    theme.setReducedTransparency(false);
    expect(root.hasAttribute('data-transparency')).toBe(false);
    expect(localStorage.getItem(TRANSPARENCY_STORAGE_KEY)).toBeNull();
  });

  it('restores reduced transparency from storage', () => {
    localStorage.setItem(TRANSPARENCY_STORAGE_KEY, 'reduced');

    expect(setup(false).reducedTransparency()).toBe(true);
    expect(root.getAttribute('data-transparency')).toBe('reduced');
  });

  it('paints both theme-color metas with the forced theme colour and restores them on system', () => {
    const theme = setup(false);
    root.style.setProperty('--theme-color', 'forced-colour');

    theme.setPreference('dark');
    expect(metas.map((meta) => meta.content)).toEqual(['forced-colour', 'forced-colour']);

    theme.setPreference('system');
    expect(metas.map((meta) => meta.content)).toEqual(['light-default', 'dark-default']);
  });

  it('keeps working when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const theme = setup(false);
    theme.setPreference('dark');

    expect(theme.resolved()).toBe('dark');
  });
});
