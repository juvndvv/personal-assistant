import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  linkedSignal,
  model,
  signal,
} from '@angular/core';
import { YuwInputAddonImports, YuwInputComponent } from 'yukit-web';
import { formatCentsForInput } from '../../core/money/format-cents';
import { parseEuroToCents, parseSignedEuroToCents } from '../../core/money/parse-euro-to-cents';
import { syncFieldAccessibility } from './field-accessibility';
import { UiField } from './ui-field';
import { FIELD_SIZE, UiSize, UiState, nextUiId } from './ui-types';

const INVALID_AMOUNT_HINT = 'Introduce un importe válido, por ejemplo 12,50';
const INVALID_SIGNED_AMOUNT_HINT = 'Introduce un importe válido, por ejemplo 12,50 o -12,50';
const PENDING_SIGN = /^\s*[-\u2212]\s*$/;

@Component({
  selector: 'ui-money-input',
  imports: [UiField, YuwInputComponent, YuwInputAddonImports],
  template: `
    <ui-field
      [controlId]="inputId()"
      [label]="label()"
      [hint]="effectiveHint()"
      [state]="effectiveState()"
      [required]="required()"
    >
      <yuw-input
        [inputId]="inputId()"
        [value]="text()"
        (valueChange)="onTextChange($event)"
        (committed)="onCommit()"
        inputmode="decimal"
        autocomplete="off"
        [size]="fieldSize[size()]"
        [placeholder]="placeholder()"
        [name]="name()"
        [required]="required()"
        [disabled]="disabled()"
        [invalid]="effectiveState() === 'error'"
        class="amount"
      >
        <yuw-right-addon><span aria-hidden="true">€</span></yuw-right-addon>
      </yuw-input>
    </ui-field>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiMoneyInput {
  readonly value = model<number | null>(null);
  readonly label = input<string>();
  readonly hint = input<string>();
  readonly state = input<UiState>('default');
  readonly size = input<UiSize>('md');
  readonly placeholder = input('0,00');
  readonly name = input<string>();
  readonly required = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly allowNegative = input(false, { transform: booleanAttribute });
  readonly inputId = input(nextUiId('ui-money-input'));

  protected readonly fieldSize = FIELD_SIZE;
  protected readonly text = linkedSignal<number | null, string>({
    source: this.value,
    computation: (cents, previous) => {
      if (previous !== undefined && this.parse(previous.value) === cents) {
        return previous.value;
      }
      return cents === null ? '' : formatCentsForInput(cents);
    },
  });
  private readonly unparseable = signal(false);

  protected readonly effectiveState = computed<UiState>(() =>
    this.unparseable() ? 'error' : this.state(),
  );
  protected readonly effectiveHint = computed(() =>
    this.unparseable()
      ? this.allowNegative()
        ? INVALID_SIGNED_AMOUNT_HINT
        : INVALID_AMOUNT_HINT
      : this.hint(),
  );

  constructor() {
    syncFieldAccessibility(this.inputId, this.effectiveState, this.effectiveHint);
  }

  protected onTextChange(raw: string): void {
    this.text.set(raw);
    const incomplete = raw.trim() === '' || (this.allowNegative() && PENDING_SIGN.test(raw));
    const cents = incomplete ? null : this.parse(raw);
    this.unparseable.set(!incomplete && cents === null);
    this.value.set(cents);
  }

  private parse(raw: string): number | null {
    return this.allowNegative() ? parseSignedEuroToCents(raw) : parseEuroToCents(raw);
  }

  protected onCommit(): void {
    const cents = this.value();
    if (cents !== null && !this.unparseable()) {
      this.text.set(formatCentsForInput(cents));
    }
  }
}
