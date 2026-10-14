import { CdkVirtualScrollViewport, VirtualScrollStrategy } from '@angular/cdk/scrolling';
import { Subject, distinctUntilChanged } from 'rxjs';

export function indexAtOffset(offsets: readonly number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (offsets[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, low);
}

export class VariableSizeScrollStrategy implements VirtualScrollStrategy {
  private readonly indexChanges = new Subject<number>();
  readonly scrolledIndexChange = this.indexChanges.pipe(distinctUntilChanged());

  private viewport: CdkVirtualScrollViewport | null = null;
  private offsets: number[] = [0];

  constructor(private readonly bufferPx: number) {}

  setItemSizes(sizes: readonly number[]): void {
    const offsets = [0];
    for (const size of sizes) {
      offsets.push(offsets[offsets.length - 1] + size);
    }
    this.offsets = offsets;
    this.update();
  }

  attach(viewport: CdkVirtualScrollViewport): void {
    this.viewport = viewport;
    this.update();
  }

  detach(): void {
    this.indexChanges.complete();
    this.viewport = null;
  }

  onContentScrolled(): void {
    this.update();
  }

  onDataLengthChanged(): void {
    this.update();
  }

  onContentRendered(): void {
    return;
  }

  onRenderedOffsetChanged(): void {
    return;
  }

  scrollToIndex(index: number, behavior: ScrollBehavior): void {
    const offset = this.offsets[Math.min(Math.max(index, 0), this.offsets.length - 1)];
    this.viewport?.scrollToOffset(offset, behavior);
  }

  private update(): void {
    const viewport = this.viewport;
    if (viewport === null) {
      return;
    }
    const itemCount = Math.min(viewport.getDataLength(), this.offsets.length - 1);
    viewport.setTotalContentSize(this.offsets[itemCount]);
    if (itemCount === 0) {
      viewport.setRenderedRange({ start: 0, end: 0 });
      viewport.setRenderedContentOffset(0);
      return;
    }
    const scrollOffset = viewport.measureScrollOffset();
    const visibleEnd = scrollOffset + viewport.getViewportSize();
    const start = indexAtOffset(this.offsets, Math.max(0, scrollOffset - this.bufferPx));
    const end = Math.min(itemCount, indexAtOffset(this.offsets, visibleEnd + this.bufferPx) + 1);
    viewport.setRenderedRange({ start: Math.min(start, end), end });
    viewport.setRenderedContentOffset(this.offsets[Math.min(start, end)]);
    this.indexChanges.next(indexAtOffset(this.offsets, scrollOffset));
  }
}
