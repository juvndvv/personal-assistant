import { TestBed } from '@angular/core/testing';
import { audioFormatFromMime, negotiateAudioFormat } from './audio-format';
import { MAX_RECORDING_MS, RecordedAudio, VoiceRecorder } from './voice-recorder';

class FakeMediaRecorder {
  static supported: string[] = [];
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(mime: string): boolean {
    return FakeMediaRecorder.supported.includes(mime);
  }

  state: 'inactive' | 'recording' = 'inactive';
  readonly mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  timeslice: number | undefined;

  constructor(
    readonly stream: MediaStream,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? 'audio/mp4';
    FakeMediaRecorder.instances.push(this);
  }

  start(timeslice?: number): void {
    this.timeslice = timeslice;
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function fakeStream(): { stream: MediaStream; stopTrack: ReturnType<typeof vi.fn> } {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  return { stream, stopTrack };
}

function installMedia(getUserMedia: () => Promise<MediaStream>): void {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
}

function createRecorder(): { recorder: VoiceRecorder; outputs: RecordedAudio[] } {
  TestBed.configureTestingModule({ providers: [VoiceRecorder] });
  const recorder = TestBed.inject(VoiceRecorder);
  const outputs: RecordedAudio[] = [];
  recorder.recorded.subscribe((audio) => outputs.push(audio));
  return { recorder, outputs };
}

describe('audio format negotiation', () => {
  it('prefers webm/opus when the browser supports it', () => {
    const format = negotiateAudioFormat((mime) =>
      ['audio/webm;codecs=opus', 'audio/mp4'].includes(mime),
    );
    expect(format).toEqual({
      recorderMime: 'audio/webm;codecs=opus',
      uploadMime: 'audio/webm',
      extension: 'webm',
    });
  });

  it('falls back to audio/mp4 uploaded as .m4a on iOS Safari', () => {
    const format = negotiateAudioFormat((mime) => mime === 'audio/mp4');
    expect(format).toEqual({
      recorderMime: 'audio/mp4',
      uploadMime: 'audio/mp4',
      extension: 'm4a',
    });
  });

  it('returns null when nothing is supported', () => {
    expect(negotiateAudioFormat(() => false)).toBeNull();
  });

  it('maps the recorded MIME (with codecs) to the upload MIME and extension', () => {
    expect(audioFormatFromMime('audio/mp4;codecs=mp4a.40.2')).toEqual({
      recorderMime: 'audio/mp4;codecs=mp4a.40.2',
      uploadMime: 'audio/mp4',
      extension: 'm4a',
    });
    expect(audioFormatFromMime('audio/ogg;codecs=opus')?.extension).toBe('ogg');
    expect(audioFormatFromMime('video/quicktime')).toBeNull();
  });
});

describe('VoiceRecorder', () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.supported = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('records webm/opus on Chromium and uploads it as voz.webm', async () => {
    FakeMediaRecorder.supported = ['audio/webm;codecs=opus', 'audio/webm'];
    const { stream, stopTrack } = fakeStream();
    installMedia(async () => stream);
    const { recorder, outputs } = createRecorder();

    expect(await recorder.start()).toBe(true);
    expect(recorder.status()).toBe('recording');
    expect(FakeMediaRecorder.instances[0]?.mimeType).toBe('audio/webm;codecs=opus');

    recorder.stop();

    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.filename).toBe('voz.webm');
    expect(outputs[0]?.blob.type).toBe('audio/webm');
    expect(stopTrack).toHaveBeenCalled();
    expect(recorder.status()).toBe('idle');
  });

  it('falls back to audio/mp4 and uploads .m4a when only mp4 is supported (iOS)', async () => {
    FakeMediaRecorder.supported = ['audio/mp4'];
    installMedia(async () => fakeStream().stream);
    const { recorder, outputs } = createRecorder();

    await recorder.start();
    recorder.stop();

    expect(FakeMediaRecorder.instances[0]?.mimeType).toBe('audio/mp4');
    expect(outputs[0]?.filename).toBe('voz.m4a');
    expect(outputs[0]?.blob.type).toBe('audio/mp4');
  });

  it('stops by itself at the 60 s cap and emits the recording', async () => {
    vi.useFakeTimers();
    FakeMediaRecorder.supported = ['audio/webm;codecs=opus'];
    installMedia(async () => fakeStream().stream);
    const { recorder, outputs } = createRecorder();

    await recorder.start();
    vi.advanceTimersByTime(30_000);
    expect(recorder.status()).toBe('recording');
    expect(recorder.elapsedMs()).toBeGreaterThanOrEqual(29_900);

    vi.advanceTimersByTime(MAX_RECORDING_MS);

    expect(recorder.status()).toBe('idle');
    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.durationMs).toBe(MAX_RECORDING_MS);
  });

  it('reports a denied microphone permission', async () => {
    installMedia(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    });
    const { recorder } = createRecorder();

    expect(await recorder.start()).toBe(false);
    expect(recorder.status()).toBe('denied');
  });

  it('reports unsupported browsers without MediaRecorder', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const { recorder } = createRecorder();

    expect(await recorder.start()).toBe(false);
    expect(recorder.status()).toBe('unsupported');
  });

  it('discards the audio when cancelled', async () => {
    FakeMediaRecorder.supported = ['audio/mp4'];
    installMedia(async () => fakeStream().stream);
    const { recorder, outputs } = createRecorder();

    await recorder.start();
    recorder.cancel();

    expect(outputs).toHaveLength(0);
    expect(recorder.status()).toBe('idle');
  });
});
