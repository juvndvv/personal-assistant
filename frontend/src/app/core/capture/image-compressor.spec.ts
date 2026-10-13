import { TestBed } from '@angular/core/testing';
import { ImageCompressor, JPEG_QUALITY, MAX_IMAGE_SIDE, fitWithin } from './image-compressor';

interface CanvasCall {
  width: number;
  height: number;
  type: string | undefined;
  quality: unknown;
  drawn: unknown[];
}

function stubCanvas(): CanvasCall[] {
  const calls: CanvasCall[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const { width, height } = this;
    return {
      drawImage: (...args: unknown[]) => {
        calls.push({ width, height, type: undefined, quality: undefined, drawn: args.slice(1) });
      },
    } as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback: BlobCallback, type?: string, quality?: unknown) => {
      const last = calls[calls.length - 1];
      if (last !== undefined) {
        last.type = type;
        last.quality = quality;
      }
      callback(new Blob(['jpeg'], { type: type ?? 'image/png' }));
    },
  );
  return calls;
}

function stubBitmap(width: number, height: number) {
  const close = vi.fn();
  const createImageBitmap = vi.fn(async () => ({ width, height, close }));
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  return { createImageBitmap, close };
}

describe('fitWithin', () => {
  it('keeps images already within the limit', () => {
    expect(fitWithin({ width: 1200, height: 900 })).toEqual({ width: 1200, height: 900 });
  });

  it('scales the longest side down to 1600 px keeping the aspect ratio', () => {
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin({ width: 4000, height: 3000 })).toEqual({ width: 1600, height: 1200 });
  });
});

describe('ImageCompressor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('honours EXIF orientation and encodes a JPEG at quality 0.8 within 1600 px', async () => {
    const calls = stubCanvas();
    const { createImageBitmap, close } = stubBitmap(3024, 4032);
    const file = new File(['raw'], 'IMG_0001.HEIC', { type: 'image/heic' });

    const result = await TestBed.inject(ImageCompressor).compress(file);

    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(calls[0]).toMatchObject({
      width: 1200,
      height: 1600,
      type: 'image/jpeg',
      quality: JPEG_QUALITY,
      drawn: [0, 0, 1200, 1600],
    });
    expect(Math.max(calls[0]?.width ?? 0, calls[0]?.height ?? 0)).toBeLessThanOrEqual(
      MAX_IMAGE_SIDE,
    );
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.filename).toBe('IMG_0001.jpg');
    expect(close).toHaveBeenCalled();
  });

  it('uploads the original JPEG when the browser cannot decode it', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode failed');
      }),
    );
    const file = new File(['raw'], 'ticket.jpg', { type: 'image/jpeg' });

    const result = await TestBed.inject(ImageCompressor).compress(file);

    expect(result.blob).toBe(file);
    expect(result.filename).toBe('ticket.jpg');
  });

  it('rejects unsupported formats it cannot re-encode', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode failed');
      }),
    );
    const file = new File(['raw'], 'ticket.heic', { type: 'image/heic' });

    await expect(TestBed.inject(ImageCompressor).compress(file)).rejects.toThrow();
  });
});
