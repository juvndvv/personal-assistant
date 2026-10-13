import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiToaster } from './shared/ui/ui-toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UiToaster],
  template: `
    <router-outlet />
    @defer (on idle) {
      <ui-toaster />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
