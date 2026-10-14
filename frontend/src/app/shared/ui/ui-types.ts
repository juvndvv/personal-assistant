export type UiState = 'default' | 'warning' | 'error';
export type UiSize = 'sm' | 'md' | 'lg';

let sequence = 0;

export function nextUiId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export const FIELD_SIZE: Record<UiSize, 'sm' | 'default' | 'lg'> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
};

export const FIELD_STATE_CLASS: Record<UiState, string> = {
  default: 'border-input focus-visible:border-ring focus-visible:ring-ring/50',
  warning: 'border-warning focus-visible:border-ring focus-visible:ring-warning/50',
  error: 'border-destructive focus-visible:border-ring focus-visible:ring-destructive/50',
};
