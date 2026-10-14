import { TestBed } from '@angular/core/testing';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdates, RELOAD_PAGE } from './app-updates';

class FakeSwUpdate {
  isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  readonly unrecoverable = new Subject<UnrecoverableStateEvent>();
  readonly activateUpdate = vi.fn(() => Promise.resolve(true));
  readonly checkForUpdate = vi.fn(() => Promise.resolve(false));
}

const versionReady: VersionEvent = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'old' },
  latestVersion: { hash: 'new' },
};

function setup(isEnabled = true) {
  const swUpdate = new FakeSwUpdate();
  swUpdate.isEnabled = isEnabled;
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: SwUpdate, useValue: swUpdate },
      { provide: RELOAD_PAGE, useValue: reload },
    ],
  });
  const updates = TestBed.inject(AppUpdates);
  updates.watch();
  return { updates, swUpdate, reload };
}

describe('AppUpdates', () => {
  it('flags an update once a new version is ready', () => {
    const { updates, swUpdate } = setup();
    expect(updates.updateReady()).toBe(false);

    swUpdate.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'new' } });
    expect(updates.updateReady()).toBe(false);

    swUpdate.versionUpdates.next(versionReady);
    expect(updates.updateReady()).toBe(true);
  });

  it('activates the new version and reloads when applying the update', async () => {
    const { updates, swUpdate, reload } = setup();
    swUpdate.versionUpdates.next(versionReady);

    await updates.applyUpdate();

    expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('still reloads when activation fails', async () => {
    const { updates, swUpdate, reload } = setup();
    swUpdate.activateUpdate.mockRejectedValue(new Error('gone'));

    await updates.applyUpdate();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('hides the prompt until the next version when dismissed', () => {
    const { updates, swUpdate } = setup();
    swUpdate.versionUpdates.next(versionReady);

    updates.dismiss();
    expect(updates.updateReady()).toBe(false);

    swUpdate.versionUpdates.next({ ...versionReady, latestVersion: { hash: 'newer' } });
    expect(updates.updateReady()).toBe(true);
  });

  it('asks for a reload when the service worker reaches an unrecoverable state', () => {
    const { updates, swUpdate } = setup();

    swUpdate.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'broken cache' });

    expect(updates.updateReady()).toBe(true);
    expect(updates.reloadRequired()).toBe(true);
  });

  it('does not flag a required reload for a regular new version', () => {
    const { updates, swUpdate } = setup();

    swUpdate.versionUpdates.next(versionReady);

    expect(updates.reloadRequired()).toBe(false);
  });

  it('keeps the reload prompt when dismissed after an unrecoverable state', () => {
    const { updates, swUpdate } = setup();
    swUpdate.versionUpdates.next(versionReady);
    swUpdate.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'broken cache' });

    updates.dismiss();

    expect(updates.updateReady()).toBe(true);
    expect(updates.reloadRequired()).toBe(true);
  });

  it('reloads the page without activating a version when a reload is required', () => {
    const { updates, swUpdate, reload } = setup();
    swUpdate.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'broken cache' });

    updates.reload();

    expect(reload).toHaveBeenCalledOnce();
    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
  });

  it('checks for updates when the app becomes visible again', () => {
    const { swUpdate } = setup();

    document.dispatchEvent(new Event('visibilitychange'));

    expect(swUpdate.checkForUpdate).toHaveBeenCalled();
  });

  it('skips the update check when the app goes to the background', () => {
    const { swUpdate } = setup();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    try {
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      visibility.mockRestore();
    }

    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });

  it('does nothing when the service worker is disabled', () => {
    const { updates, swUpdate } = setup(false);

    swUpdate.versionUpdates.next(versionReady);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(updates.updateReady()).toBe(false);
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
  });
});
