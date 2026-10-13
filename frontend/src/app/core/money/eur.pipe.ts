import { Pipe, PipeTransform } from '@angular/core';
import { FormatCentsOptions, formatCents } from './format-cents';

@Pipe({ name: 'eur' })
export class EurPipe implements PipeTransform {
  transform(cents: number | null | undefined, options: FormatCentsOptions = {}): string {
    return cents === null || cents === undefined ? '' : formatCents(cents, options);
  }
}
