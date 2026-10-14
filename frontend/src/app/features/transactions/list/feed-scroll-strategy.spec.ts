import { ListRange } from '@angular/cdk/collections';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { VariableSizeScrollStrategy, indexAtOffset } from './feed-scroll-strategy';

function fakeViewport(dataLength: number, viewportSize: number, scrollOffset = 0) {
  const state = {
    totalSize: 0,
    range: { start: 0, end: 0 } as ListRange,
    contentOffset: 0,
    scrollOffset,
  };
  const viewport = {
    getDataLength: () => dataLength,
    getViewportSize: () => viewportSize,
    measureScrollOffset: () => state.scrollOffset,
    setTotalContentSize: (size: number) => (state.totalSize = size),
    setRenderedRange: (range: ListRange) => (state.range = range),
    setRenderedContentOffset: (offset: number) => (state.contentOffset = offset),
    scrollToOffset: vi.fn(),
  };
  return { viewport: viewport as unknown as CdkVirtualScrollViewport, state, raw: viewport };
}

describe('indexAtOffset', () => {
  const offsets = [0, 40, 104, 168, 208];

  it('finds the item that contains an offset', () => {
    expect(indexAtOffset(offsets, 0)).toBe(0);
    expect(indexAtOffset(offsets, 39)).toBe(0);
    expect(indexAtOffset(offsets, 40)).toBe(1);
    expect(indexAtOffset(offsets, 170)).toBe(3);
  });

  it('clamps offsets past the end to the last item', () => {
    expect(indexAtOffset(offsets, 10_000)).toBe(3);
  });
});

describe('VariableSizeScrollStrategy', () => {
  it('sizes the content from mixed header and row heights', () => {
    const strategy = new VariableSizeScrollStrategy(0);
    const { viewport, state } = fakeViewport(4, 1000);
    strategy.attach(viewport);

    strategy.setItemSizes([40, 64, 64, 40]);

    expect(state.totalSize).toBe(208);
    expect(state.range).toEqual({ start: 0, end: 4 });
    expect(state.contentOffset).toBe(0);
  });

  it('renders only the items around the scrolled window plus the buffer', () => {
    const strategy = new VariableSizeScrollStrategy(64);
    const { viewport, state } = fakeViewport(100, 128, 640);
    strategy.attach(viewport);

    strategy.setItemSizes(Array.from({ length: 100 }, () => 64));

    expect(state.range).toEqual({ start: 9, end: 14 });
    expect(state.contentOffset).toBe(576);
  });

  it('scrolls to the offset of an item', () => {
    const strategy = new VariableSizeScrollStrategy(0);
    const { viewport, raw } = fakeViewport(3, 100);
    strategy.attach(viewport);
    strategy.setItemSizes([40, 64, 64]);

    strategy.scrollToIndex(2, 'auto');

    expect(raw.scrollToOffset).toHaveBeenCalledWith(104, 'auto');
  });
});
