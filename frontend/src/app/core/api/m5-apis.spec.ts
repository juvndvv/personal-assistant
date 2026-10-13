import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  aCaptureMetrics,
  aNetWorth,
  aSummary,
  aTrend,
} from '../../features/reports/testing/report-fixtures';
import { ReportsApi } from './reports.api';

describe('M5 API clients', () => {
  let backend: HttpTestingController;
  let api: ReportsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ReportsApi);
  });

  afterEach(() => backend.verify());

  it('fetches the summary of the current or a given period', async () => {
    const current = firstValueFrom(api.summary());
    backend
      .expectOne({ method: 'GET', url: '/api/v1/reports/summary' })
      .flush({ data: aSummary() });
    expect((await current).savings_rate_bp).toBe(2500);

    const october = firstValueFrom(api.summary('2026-10'));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/reports/summary?period=2026-10' })
      .flush({ data: aSummary() });
    expect((await october).by_category.expense[0]?.children[0]?.name).toBe('Supermercado');
  });

  it('fetches the trend with periods, until and category', async () => {
    const trend = firstValueFrom(api.trend({ periods: 12, until: '2026-10', category_id: 10 }));
    backend
      .expectOne({
        method: 'GET',
        url: '/api/v1/reports/trend?periods=12&until=2026-10&category_id=10',
      })
      .flush({ data: aTrend() });
    expect(await trend).toHaveLength(12);

    const plain = firstValueFrom(api.trend());
    backend.expectOne({ method: 'GET', url: '/api/v1/reports/trend' }).flush({ data: [] });
    expect(await plain).toEqual([]);
  });

  it('fetches the net worth at a date', async () => {
    const netWorth = firstValueFrom(api.netWorth('2026-10-13'));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/reports/net-worth?date=2026-10-13' })
      .flush({ data: aNetWorth() });
    expect((await netWorth).total_cents).toBe(1834500);

    const today = firstValueFrom(api.netWorth());
    backend
      .expectOne({ method: 'GET', url: '/api/v1/reports/net-worth' })
      .flush({ data: aNetWorth() });
    expect((await today).accounts).toHaveLength(4);
  });

  it('fetches the capture metrics of a period', async () => {
    const metrics = firstValueFrom(api.captureMetrics('2026-10'));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/reports/capture-metrics?period=2026-10' })
      .flush({ data: aCaptureMetrics() });
    expect((await metrics).unedited_share_bp).toBe(8235);
  });
});
