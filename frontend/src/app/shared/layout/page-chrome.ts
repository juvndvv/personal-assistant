import { Injectable, signal } from '@angular/core';

export interface PageBackLink {
  link: string;
  label: string;
}

export interface PageChromeState {
  title: string;
  back: PageBackLink | null;
}

@Injectable({ providedIn: 'root' })
export class PageChrome {
  private readonly owner = signal<object | null>(null);
  private readonly stateSignal = signal<PageChromeState | null>(null);
  private readonly largeTitleVisibleSignal = signal(true);
  private readonly hostedSignal = signal(false);

  readonly state = this.stateSignal.asReadonly();
  readonly largeTitleVisible = this.largeTitleVisibleSignal.asReadonly();
  readonly hosted = this.hostedSignal.asReadonly();

  publish(owner: object, state: PageChromeState): void {
    this.owner.set(owner);
    this.stateSignal.set(state);
  }

  setLargeTitleVisible(owner: object, visible: boolean): void {
    if (this.owner() === owner) {
      this.largeTitleVisibleSignal.set(visible);
    }
  }

  release(owner: object): void {
    if (this.owner() !== owner) {
      return;
    }
    this.owner.set(null);
    this.stateSignal.set(null);
    this.largeTitleVisibleSignal.set(true);
  }

  attachHost(): void {
    this.hostedSignal.set(true);
  }

  detachHost(): void {
    this.hostedSignal.set(false);
  }
}
