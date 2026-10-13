import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  model,
} from '@angular/core';
import {
  YuwInputComponent,
  YuwInputModeDto,
  YuwInputTypeDto,
  YuwPasswordInputComponent,
} from 'yukit-web';
import { syncFieldAccessibility } from './field-accessibility';
import { UiField } from './ui-field';
import { FIELD_SIZE, UiSize, UiState, nextUiId } from './ui-types';

export type UiInputType = 'text' | 'email' | 'password' | 'tel' | 'url';

@Component({
  selector: 'ui-input',
  imports: [UiField, YuwInputComponent, YuwPasswordInputComponent],
  template: `
    <ui-field
      [controlId]="inputId()"
      [label]="label()"
      [hint]="hint()"
      [state]="state()"
      [required]="required()"
    >
      @if (type() === 'password') {
        <yuw-password-input
          [inputId]="inputId()"
          [(value)]="value"
          [size]="fieldSize[size()]"
          [placeholder]="placeholder()"
          [autocomplete]="autocomplete()"
          [name]="name()"
          [required]="required()"
          [disabled]="disabled()"
          [readonly]="readonly()"
          [invalid]="state() === 'error'"
          revealAriaLabel="Mostrar u ocultar la contraseña"
        />
      } @else {
        <yuw-input
          [inputId]="inputId()"
          [(value)]="value"
          [type]="textType()"
          [size]="fieldSize[size()]"
          [inputmode]="inputmode()"
          [placeholder]="placeholder()"
          [autocomplete]="autocomplete()"
          [name]="name()"
          [maxlength]="maxlength()"
          [required]="required()"
          [disabled]="disabled()"
          [readonly]="readonly()"
          [invalid]="state() === 'error'"
        />
      }
    </ui-field>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiInput {
  readonly value = model('');
  readonly label = input<string>();
  readonly hint = input<string>();
  readonly state = input<UiState>('default');
  readonly size = input<UiSize>('md');
  readonly type = input<UiInputType>('text');
  readonly inputmode = input<YuwInputModeDto>();
  readonly placeholder = input<string>();
  readonly autocomplete = input<string>();
  readonly name = input<string>();
  readonly maxlength = input<number>();
  readonly required = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly inputId = input(nextUiId('ui-input'));

  protected readonly fieldSize = FIELD_SIZE;

  constructor() {
    syncFieldAccessibility(this.inputId, this.state, this.hint);
  }

  protected readonly textType = computed<YuwInputTypeDto>(() => {
    const type = this.type();
    return type === 'password' ? 'text' : type;
  });
}
