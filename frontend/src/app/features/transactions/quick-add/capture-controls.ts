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
import { UiAlert, UiButton } from '../../../shared/ui';

export interface CapturedFile {
  kind: CaptureKind;
  file: Blob;
  filename: string;
}

export const HOLD_TO_TALK_MS = 400;

export const OVERLAY_FEEDBACK =
  'hover:bg-[image:linear-gradient(var(--color-hover),var(--color-hover))] active:bg-[image:linear-gradient(var(--color-pressed),var(--color-pressed))]';

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
  imports: [NgIcon, UiAlert, UiButton],
  providers: [VoiceRecorder, provideIcons({ lucideCamera, lucideMic, lucideSend, lucideX })],
  host: { class: 'flex flex-col gap-3' },
  template: `
    @if (recording()) {
      <div
        class="flex flex-col gap-3 rounded-card bg-callout-error p-3"
        role="status"
        data-testid="voice-recording"
      >
        <div class="flex items-center gap-3">
          <span
            class="size-2.5 shrink-0 rounded-full bg-destructive motion-safe:animate-pulse"
            aria-hidden="true"
          ></span>
          <span class="text-[0.9375rem] font-medium text-foreground">Grabando…</span>
          <span
            class="tabular-amount ms-auto text-sm text-muted-foreground"
            data-testid="voice-timer"
          >
            {{ elapsed() }} / {{ limit }}
          </span>
        </div>
        <div
          class="h-2 overflow-hidden rounded-capsule bg-fill-on-card"
          role="meter"
          aria-label="Nivel del micrófono"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuenow]="levelPercent()"
        >
          <div
            class="h-full rounded-capsule bg-destructive transition-[width] duration-100"
            [style.width.%]="levelPercent()"
          ></div>
        </div>
        <p class="text-sm text-muted-foreground">
          Di el importe, el comercio y la cuenta. Suelta o pulsa Enviar al terminar.
        </p>
        <div class="flex gap-2">
          <ui-button class="min-w-0 flex-1" [fullWidth]="true" (clicked)="finish()">
            <ng-icon name="lucideSend" size="16" aria-hidden="true" />
            Enviar audio
          </ui-button>
          <ui-button variant="secondary" (clicked)="discard()">
            <ng-icon name="lucideX" size="16" aria-hidden="true" />
            Cancelar
          </ui-button>
        </div>
      </div>
    }
    <p role="alert" class="sr-only" data-testid="capture-problem-announcer">{{ problem() }}</p>
    @if (problem(); as message) {
      <ui-alert tone="warning" data-testid="capture-problem">{{ message }}</ui-alert>
    }
    <div class="flex items-center gap-2">
      <button
        #voiceButton
        type="button"
        class="capture-button inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-capsule px-4 text-[0.9375rem] font-medium transition-colors duration-150 select-none disabled:opacity-50"
        [class]="
          recording()
            ? 'bg-destructive text-destructive-foreground'
            : 'glass-fill text-foreground ' + overlayFeedback
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
        <ng-icon name="lucideMic" size="20" aria-hidden="true" />
        Voz
      </button>
      <button
        type="button"
        class="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-capsule px-4 text-[0.9375rem] font-medium text-foreground glass-fill transition-colors duration-150 disabled:opacity-50"
        [class]="overlayFeedback"
        data-testid="capture-photo"
        [disabled]="disabled() || recording() || compressing()"
        (click)="pickPhoto()"
      >
        <ng-icon name="lucideCamera" size="20" aria-hidden="true" />
        Foto
      </button>
      <ng-content />
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
  `,
  styles: '.capture-button { touch-action: none; -webkit-touch-callout: none; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureControls {
  private readonly recorder = inject(VoiceRecorder);
  private readonly compressor = inject(ImageCompressor);
  private readonly photoInput = viewChild.required<ElementRef<HTMLInputElement>>('photoInput');
  private readonly voiceButton = viewChild.required<ElementRef<HTMLButtonElement>>('voiceButton');

  readonly disabled = input(false, { transform: booleanAttribute });
  readonly active = input(true, { transform: booleanAttribute });
  readonly captured = output<CapturedFile>();

  protected readonly limit = formatSeconds(MAX_RECORDING_MS);
  protected readonly overlayFeedback = OVERLAY_FEEDBACK;
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

  focusVoice(): void {
    this.voiceButton().nativeElement.focus();
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
