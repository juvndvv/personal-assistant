import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { CaptureMetrics } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import { CaptureQualityPanel } from './capture-quality-panel';
import { aCaptureMetrics } from './testing/report-fixtures';

async function setup(metrics = aCaptureMetrics()) {
  const api = {
    captureMetrics: vi.fn((): Observable<CaptureMetrics> => of(metrics)),
  };
  await render(CaptureQualityPanel, {
    inputs: { period: '2026-10' },
    providers: [{ provide: ReportsApi, useValue: api }],
  });
  return api;
}

describe('CaptureQualityPanel', () => {
  it('shows the PRD capture metrics against their targets', async () => {
    const api = await setup();

    expect(await screen.findByRole('region', { name: 'Calidad de captura' })).toBeInTheDocument();
    expect(api.captureMetrics).toHaveBeenCalledWith('2026-10');
    expect(screen.getByTestId('captures-confirmed')).toHaveTextContent('34 capturas confirmadas');
    const time = screen.getByTestId('capture-time');
    expect(time).toHaveTextContent('8,4 s');
    expect(time).toHaveTextContent('p90: 14 s');
    expect(time).toHaveTextContent('Objetivo cumplido: menos de 10 s');
    const unedited = screen.getByTestId('capture-unedited');
    expect(unedited).toHaveTextContent('82,4 %');
    expect(unedited).toHaveTextContent('Objetivo cumplido: 80 % o más');
    const days = screen.getByTestId('capture-active-days');
    expect(days).toHaveTextContent('5,9 de 7');
    expect(days).toHaveTextContent('22 de 26 días del periodo');
    expect(days).toHaveTextContent('Objetivo cumplido: 5 de 7 días o más');
  });

  it('flags metrics that miss their targets', async () => {
    await setup(
      aCaptureMetrics({
        median_seconds_to_confirm: 12.5,
        unedited_share_bp: 6000,
        active_days_per_week: 3.5,
      }),
    );

    expect(await screen.findByTestId('capture-time')).toHaveTextContent(
      'Objetivo no alcanzado: menos de 10 s',
    );
    expect(screen.getByTestId('capture-unedited')).toHaveTextContent(
      'Objetivo no alcanzado: 80 % o más',
    );
    expect(screen.getByTestId('capture-active-days')).toHaveTextContent(
      'Objetivo no alcanzado: 5 de 7 días o más',
    );
  });

  it('shows the targets without a verdict when nothing was captured', async () => {
    await setup(
      aCaptureMetrics({
        captures_confirmed: 0,
        median_seconds_to_confirm: null,
        p90_seconds_to_confirm: null,
        unedited_share_bp: null,
        active_days: 0,
        elapsed_days: 0,
        active_days_per_week: null,
      }),
    );

    expect(await screen.findByTestId('captures-confirmed')).toHaveTextContent(
      'Sin capturas por voz o foto confirmadas en este periodo.',
    );
    expect(screen.getByTestId('capture-time')).toHaveTextContent('—');
    expect(screen.getByTestId('capture-time')).toHaveTextContent('Objetivo: menos de 10 s');
    expect(screen.getByTestId('capture-active-days')).toHaveTextContent(
      'Objetivo: 5 de 7 días o más',
    );
    expect(screen.getByTestId('capture-active-days')).toHaveTextContent('—');
  });
  it('shows skeleton tiles while the metrics load', async () => {
    const api = { captureMetrics: vi.fn(() => NEVER) };
    await render(CaptureQualityPanel, {
      inputs: { period: '2026-10' },
      providers: [{ provide: ReportsApi, useValue: api }],
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando métricas de captura');
  });

  it('retries the metrics after a failure', async () => {
    const metrics = aCaptureMetrics();
    const api = {
      captureMetrics: vi.fn((): Observable<CaptureMetrics> =>
        throwError(() => new Error('offline')),
      ),
    };
    const view = await render(CaptureQualityPanel, {
      inputs: { period: '2026-10' },
      providers: [{ provide: ReportsApi, useValue: api }],
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar las métricas de captura.');

    api.captureMetrics.mockReturnValue(of(metrics));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    view.detectChanges();

    expect(await screen.findByTestId('captures-confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
