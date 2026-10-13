import { Injectable, inject } from '@angular/core';
import { ImageCompressor } from '../../../core/capture/image-compressor';

export interface ReceiptFile {
  blob: Blob;
  filename: string;
}

@Injectable({ providedIn: 'root' })
export class ReceiptUpload {
  private readonly compressor = inject(ImageCompressor);

  async prepare(file: File): Promise<ReceiptFile> {
    if (file.type.startsWith('image/')) {
      return this.compressor.compress(file);
    }
    return { blob: file, filename: file.name === '' ? 'justificante' : file.name };
  }
}
