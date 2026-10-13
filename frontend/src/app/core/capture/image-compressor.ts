import { Injectable } from '@angular/core';

export const MAX_IMAGE_SIDE = 1600;
export const JPEG_QUALITY = 0.8;
export const COMPRESSED_IMAGE_MIME = 'image/jpeg';
const UPLOADABLE_ORIGINALS = ['image/jpeg', 'image/png', 'image/webp'];

export interface Dimensions {
  width: number;
  height: number;
}

export interface CompressedImage {
  blob: Blob;
  filename: string;
}

export function fitWithin(source: Dimensions, maxSide = MAX_IMAGE_SIDE): Dimensions {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxSide) {
    return { width: source.width, height: source.height };
  }
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

function baseName(filename: string): string {
  const name = filename.replace(/\.[^.]+$/, '').trim();
  return name === '' ? 'ticket' : name;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('Image encoding failed')) : resolve(blob)),
      COMPRESSED_IMAGE_MIME,
      JPEG_QUALITY,
    );
  });
}

@Injectable({ providedIn: 'root' })
export class ImageCompressor {
  async compress(file: File): Promise<CompressedImage> {
    try {
      return { blob: await this.reencode(file), filename: `${baseName(file.name)}.jpg` };
    } catch (error: unknown) {
      if (UPLOADABLE_ORIGINALS.includes(file.type)) {
        return { blob: file, filename: file.name === '' ? 'ticket.jpg' : file.name };
      }
      throw error;
    }
  }

  private async reencode(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const target = fitWithin({ width: bitmap.width, height: bitmap.height });
      const canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext('2d');
      if (context === null) {
        throw new Error('Canvas 2D context unavailable');
      }
      context.drawImage(bitmap, 0, 0, target.width, target.height);
      return await canvasToBlob(canvas);
    } finally {
      bitmap.close();
    }
  }
}
