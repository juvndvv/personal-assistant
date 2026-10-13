import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCamera, lucideMic, lucideSend, lucideX } from '@ng-icons/lucide';
import { CaptureKind } from '../../../core/api/models';
import { ImageCompressor } from '../../../core/capture/image-compressor';
import { MAX_RECORDING_MS, VoiceRecorder } from '../../../core/capture/voice-recorder';

export interface CapturedFile {
  kind: CaptureKind;
  file: Blob;
  filename: string;
}

export const HOLD_TO_TALK_MS = 400;

const RECORDER_MESSAGES: Partial<Record<string, string>> = {
  denied:
    'No hay acceso al micrófono. Permítelo en los ajustes del navegador o introduce el movimiento a mano.',
  unsupported:
    'Este navegador no permite grabar audio. Usa la foto o introduce el movimiento a mano.',
  failed: 'No se pudo grabar el audio. Inténtalo de nuevo o introduce el movimiento a mano.',
};

function formatSeconds(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

@Component({
  selector: 'app-capture-controls',
  imports: [NgIcon],
  providers: [VoiceRecorder, provideIcons({ lucideCamera, lucideMic, lucideSend, lucideX })],
  host: { class: 'contents' },
  template: `
    <div class="flex shrink-0 gap-2">
      <button
        type="button"
        class="capture-button inline-flex h-12 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors select-none"
        [class]="
          recording()
            ? 'border-destructive bg-destructive text-destructive-foreground'
            : 'border-border bg-background text-foreground hover:bg-muted'
        "
        [attr.aria-pressed]="recording()"
        aria-describedby="capture-voice-hint"
        data-testid="capture-voice"
        [disabled]="disabled()"
        (pointerdown)="press($event)"
        (pointerup)="release()"
        (pointercancel)="release()"
        (click)="keyboardToggle($event)"
        (contextmenu)="$event.preventDefault()"
      >
        <ng-icon name="lucideMic" size="18" aria-hidden="true" />
        Voz
      </button>
      <button
        type="button"
        class="inline-flex h-12 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        data-testid="capture-photo"
        [disabled]="disabled() || recording() || compressing()"
        (click)="pickPhoto()"
      >
        <ng-icon name="lucideCamera" size="18" aria-hidden="true" />
        Foto
      </button>
      <input
        #photoInput
        type="file"
        accept="image/*"
        capture="environment"
        class="sr-only"
        tabindex="-1"
        aria-label="Foto del ticket"
        data-testid="capture-photo-input"
        (change)="onPhoto($event)"
      />
    </div>
    <p id="capture-voice-hint" class="sr-only">
      Mantén pulsado para hablar y suelta para enviar, o toca para empezar y detener.
    </p>
    @if (recording()) {
      <div
        class="col-span-full flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3"
        role="status"
        data-testid="voice-recording"
      >
        <div class="flex items-center gap-3">
          <span
            class="size-2.5 animate-pulse rounded-full bg-destructive"
            aria-hidden="true"
          ></span>
          <span class="text-sm font-medium text-foreground">Grabando…</span>
          <span
            class="ms-auto text-sm tabular-nums text-muted-foreground"
            data-testid="voice-timer"
          >
            {{ elapsed() }} / {{ limit }}
          </span>
        </div>
        <div
          class="h-2 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label="Nivel del micrófono"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuenow]="levelPercent()"
        >
          <div
            class="h-full rounded-full bg-destructive transition-[width] duration-100"
            [style.width.%]="levelPercent()"
          ></div>
        </div>
        <p class="text-xs text-muted-foreground">
          Di el importe, el comercio y la cuenta. Suelta o pulsa Enviar al terminar.
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            class="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground"
            (click)="finish()"
          >
            <ng-icon name="lucideSend" size="16" aria-hidden="true" />
            Enviar audio
          </button>
          <button
            type="button"
            class="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-foreground"
            (click)="discard()"
          >
            <ng-icon name="lucideX" size="16" aria-hidden="true" />
            Cancelar
          </button>
        </div>
      </div>
    }
    @if (problem(); as message) {
      <p
        role="alert"
        class="col-span-full rounded-lg bg-warning/15 px-3 py-2 text-sm text-foreground"
        data-testid="capture-problem"
      >
        {{ message }}
      </p>
    }
  `,
  styles: '.capture-button { touch-action: none; -webkit-touch-callout: none; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureControls {
  private readonly recorder = inject(VoiceRecorder);
  private readonly compressor = inject(ImageCompressor);
  private readonly photoInput = viewChild.required<ElementRef<HTMLInputElement>>('photoInput');

  readonly disabled = input(false, { transform: booleanAttribute });
  readonly active = input(true, { transform: booleanAttribute });
  readonly captured = output<CapturedFile>();

  protected readonly limit = formatSeconds(MAX_RECORDING_MS);
  protected readonly compressing = signal(false);
  private readonly photoProblem = signal<string | null>(null);
  private pressedAt = 0;
  private holding = false;

  protected readonly recording = computed(() => this.recorder.status() === 'recording');
  protected readonly elapsed = computed(() => formatSeconds(this.recorder.elapsedMs()));
  protected readonly levelPercent = computed(() => Math.round(this.recorder.level() * 100));
  protected readonly problem = computed(
    () => RECORDER_MESSAGES[this.recorder.status()] ?? this.photoProblem(),
  );

  constructor() {
    effect(() => {
      const active = this.active();
      untracked(() => {
        if (active) {
          this.recorder.reset();
          this.photoProblem.set(null);
        } else {
          this.holding = false;
          this.recorder.cancel();
        }
      });
    });
    this.recorder.recorded
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((audio) =>
        this.captured.emit({ kind: 'voice', file: audio.blob, filename: audio.filename }),
      );
  }

  protected press(event: PointerEvent): void {
    if (event.button > 0 || this.disabled()) {
      return;
    }
    event.preventDefault();
    if (this.recording()) {
      this.recorder.stop();
      return;
    }
    this.holding = true;
    this.pressedAt = Date.now();
    void this.startRecording();
  }

  protected release(): void {
    if (!this.holding) {
      return;
    }
    this.holding = false;
    if (this.recording() && Date.now() - this.pressedAt >= HOLD_TO_TALK_MS) {
      this.recorder.stop();
    }
  }

  protected keyboardToggle(event: MouseEvent): void {
    if (event.detail !== 0) {
      return;
    }
    if (this.recording()) {
      this.recorder.stop();
      return;
    }
    void this.startRecording();
  }

  protected finish(): void {
    this.recorder.stop();
  }

  protected discard(): void {
    this.recorder.cancel();
  }

  protected pickPhoto(): void {
    this.photoProblem.set(null);
    this.recorder.reset();
    this.photoInput().nativeElement.click();
  }

  protected async onPhoto(event: Event): Promise<void> {
    const element = event.target as HTMLInputElement;
    const file = element.files?.[0];
    element.value = '';
    if (file === undefined) {
      return;
    }
    this.compressing.set(true);
    try {
      const compressed = await this.compressor.compress(file);
      this.captured.emit({ kind: 'photo', file: compressed.blob, filename: compressed.filename });
    } catch {
      this.photoProblem.set(
        'No se pudo leer la imagen. Prueba con otra foto o introduce el movimiento a mano.',
      );
    } finally {
      this.compressing.set(false);
    }
  }

  private async startRecording(): Promise<void> {
    this.photoProblem.set(null);
    await this.recorder.start();
  }
}
