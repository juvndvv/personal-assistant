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
