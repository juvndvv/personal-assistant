import { Injectable, OnDestroy, signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  AUDIO_FORMAT_PREFERENCES,
  AudioFormat,
  audioFormatFromMime,
  negotiateAudioFormat,
} from './audio-format';

export type RecorderStatus =
  'idle' | 'requesting' | 'recording' | 'denied' | 'unsupported' | 'failed';

export interface RecordedAudio {
  blob: Blob;
  filename: string;
  durationMs: number;
}

export const MAX_RECORDING_MS = 60_000;
const TICK_MS = 100;
const DATA_SLICE_MS = 1_000;
const LEVEL_GAIN = 3;
const PERMISSION_ERRORS = ['NotAllowedError', 'SecurityError', 'PermissionDeniedError'];
const FALLBACK_FORMAT = AUDIO_FORMAT_PREFERENCES[0] as AudioFormat;

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function isPermissionDenial(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === 'string' && PERMISSION_ERRORS.includes(name);
}

@Injectable()
export class VoiceRecorder implements OnDestroy {
  readonly status = signal<RecorderStatus>('idle');
  readonly elapsedMs = signal(0);
  readonly level = signal(0);
  readonly recorded = new Subject<RecordedAudio>();

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private format: AudioFormat | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private discard = false;
  private abandonRequest = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Uint8Array<ArrayBuffer> | null = null;

  static isSupported(): boolean {
    return (
      typeof globalThis.MediaRecorder === 'function' &&
      typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function'
    );
  }

  async start(): Promise<boolean> {
    const status = this.status();
    if (status === 'recording' || status === 'requesting') {
      return false;
    }
    if (!VoiceRecorder.isSupported()) {
      this.status.set('unsupported');
      return false;
    }
    this.status.set('requesting');
    this.abandonRequest = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error: unknown) {
      this.status.set(isPermissionDenial(error) ? 'denied' : 'failed');
      return false;
    }
    if (this.abandonRequest) {
      stream.getTracks().forEach((track) => track.stop());
      this.status.set('idle');
      return false;
    }
    try {
      this.begin(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      this.status.set('failed');
      return false;
    }
    return true;
  }

  stop(): void {
    this.finishRecording(false);
  }

  cancel(): void {
    if (this.status() === 'requesting') {
      this.abandonRequest = true;
      return;
    }
    this.finishRecording(true);
  }

  reset(): void {
    if (this.status() !== 'recording' && this.status() !== 'requesting') {
      this.status.set('idle');
    }
  }

  ngOnDestroy(): void {
    this.cancel();
    this.recorded.complete();
  }

  private begin(stream: MediaStream): void {
    const Recorder = globalThis.MediaRecorder;
    const format =
      typeof Recorder.isTypeSupported === 'function'
        ? negotiateAudioFormat((mime) => Recorder.isTypeSupported(mime))
        : null;
    const recorder =
      format === null
        ? new Recorder(stream)
        : new Recorder(stream, { mimeType: format.recorderMime });
    this.stream = stream;
    this.recorder = recorder;
    this.format = format;
    this.chunks = [];
    this.discard = false;
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    recorder.onstop = () => this.emitRecording();
    recorder.start(DATA_SLICE_MS);
    this.startedAt = Date.now();
    this.elapsedMs.set(0);
    this.level.set(0);
    this.startLevelMeter(stream);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.status.set('recording');
  }

  private tick(): void {
    const elapsed = Math.min(Date.now() - this.startedAt, MAX_RECORDING_MS);
    this.elapsedMs.set(elapsed);
    this.sampleLevel();
    if (elapsed >= MAX_RECORDING_MS) {
      this.stop();
    }
  }

  private finishRecording(discard: boolean): void {
    const recorder = this.recorder;
    if (recorder === null || this.status() !== 'recording') {
      return;
    }
    this.discard = discard;
    this.elapsedMs.set(Math.min(Date.now() - this.startedAt, MAX_RECORDING_MS));
    this.clearTimer();
    if (recorder.state === 'inactive') {
      this.emitRecording();
      return;
    }
    recorder.stop();
  }

  private emitRecording(): void {
    const recorder = this.recorder;
    if (recorder === null) {
      return;
    }
    this.recorder = null;
    this.clearTimer();
    this.releaseDevices();
    this.level.set(0);
    if (this.discard) {
      this.status.set('idle');
      return;
    }
    const actualMime = recorder.mimeType || this.chunks[0]?.type || '';
    const format = audioFormatFromMime(actualMime) ?? this.format ?? FALLBACK_FORMAT;
    const blob = new Blob(this.chunks, { type: format.uploadMime });
    this.chunks = [];
    if (blob.size === 0) {
      this.status.set('failed');
      return;
    }
    this.status.set('idle');
    this.recorded.next({
      blob,
      filename: `voz.${format.extension}`,
      durationMs: this.elapsedMs(),
    });
  }

  private startLevelMeter(stream: MediaStream): void {
    const Context = audioContextConstructor();
    if (Context === null) {
      return;
    }
    try {
      const context = new Context();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      this.audioContext = context;
      this.analyser = analyser;
      this.samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    } catch {
      this.audioContext = null;
      this.analyser = null;
    }
  }

  private sampleLevel(): void {
    if (this.analyser === null || this.samples === null) {
      return;
    }
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (const sample of this.samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / this.samples.length);
    this.level.set(Math.min(1, rms * LEVEL_GAIN));
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private releaseDevices(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
    this.analyser = null;
    this.samples = null;
  }
}
