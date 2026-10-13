export interface AudioFormat {
  recorderMime: string;
  uploadMime: string;
  extension: string;
}

export const AUDIO_FORMAT_PREFERENCES: readonly AudioFormat[] = [
  { recorderMime: 'audio/webm;codecs=opus', uploadMime: 'audio/webm', extension: 'webm' },
  { recorderMime: 'audio/mp4', uploadMime: 'audio/mp4', extension: 'm4a' },
  { recorderMime: 'audio/webm', uploadMime: 'audio/webm', extension: 'webm' },
  { recorderMime: 'audio/ogg;codecs=opus', uploadMime: 'audio/ogg', extension: 'ogg' },
];

const EXTENSION_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export function negotiateAudioFormat(
  isTypeSupported: (mimeType: string) => boolean,
): AudioFormat | null {
  return AUDIO_FORMAT_PREFERENCES.find((format) => isTypeSupported(format.recorderMime)) ?? null;
}

export function audioFormatFromMime(mimeType: string): AudioFormat | null {
  const uploadMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const extension = EXTENSION_BY_MIME[uploadMime];
  return extension === undefined ? null : { recorderMime: mimeType, uploadMime, extension };
}
