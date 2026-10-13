import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { YuwBadgeComponent, YuwColorDto } from 'yukit-web';
import { UiState } from './ui-types';

export type UiBadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
export type UiBadgeVariant = 'solid' | 'soft' | 'outline';

const TONE_COLOR: Record<UiBadgeTone, YuwColorDto> = {
  neutral: 'neutral',
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'destructive',
  info: 'info',
};

const STATE_TONE: Record<UiState, UiBadgeTone | null> = {
  default: null,
  warning: 'warning',
  error: 'danger',
};

const VARIANT: Record<UiBadgeVariant, 'default' | 'secondary' | 'outline'> = {
  solid: 'default',
  soft: 'secondary',
  outline: 'outline',
};

@Component({
  selector: 'ui-badge',
  imports: [YuwBadgeComponent],
  template: ` <yuw-badge [color]="color()" [variant]="yuwVariant()"><ng-content /></yuw-badge> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiBadge {
  readonly tone = input<UiBadgeTone>('neutral');
  readonly variant = input<UiBadgeVariant>('soft');
  readonly state = input<UiState>('default');

  protected readonly color = computed(() => TONE_COLOR[STATE_TONE[this.state()] ?? this.tone()]);
  protected readonly yuwVariant = computed(() => VARIANT[this.variant()]);
}
