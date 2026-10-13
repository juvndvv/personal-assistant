import { ChangeDetectionStrategy, Component, Injectable } from '@angular/core';
import { YuwToasterComponent, yuwToast } from 'yukit-web';

export type UiToastTone = 'success' | 'error' | 'warning' | 'info';

export interface UiToastOptions {
  description?: string;
  action?: { label: string; onClick: () => void };
}

@Injectable({ providedIn: 'root' })
export class UiToast {
  show(tone: UiToastTone, message: string, options: UiToastOptions = {}): void {
    yuwToast[tone](message, options);
  }

  success(message: string, options?: UiToastOptions): void {
    this.show('success', message, options);
  }

  error(message: string, options?: UiToastOptions): void {
    this.show('error', message, options);
  }

  warning(message: string, options?: UiToastOptions): void {
    this.show('warning', message, options);
  }

  info(message: string, options?: UiToastOptions): void {
    this.show('info', message, options);
  }
}

@Component({
  selector: 'ui-toaster',
  imports: [YuwToasterComponent],
  template: `<yuw-toaster position="top-center" [closeButton]="true" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiToaster {}
