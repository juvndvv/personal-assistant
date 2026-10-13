import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { aForecast, aRecurringTemplate } from '../../features/recurring/testing/recurring-fixtures';
import { RecurringTemplateInput } from './models';
import { RecurringApi } from './recurring.api';

const input: RecurringTemplateInput = {
  name: 'Luz',
  type: 'expense',
  amount_cents: 6000,
  is_variable: true,
  account_id: 3,
  category_id: 21,
  frequency: 'monthly',
  day_of_month: 5,
  starts_on: '2026-11-01',
  ends_on: null,
  description: 'Iberdrola',
  merchant: 'Iberdrola',
};

describe('M4 API clients', () => {
  let backend: HttpTestingController;
  let api: RecurringApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
    api = TestBed.inject(RecurringApi);
  });

  afterEach(() => backend.verify());

  it('lists templates including paused ones and fetches one', async () => {
    const list = firstValueFrom(api.list());
    backend
      .expectOne({ method: 'GET', url: '/api/v1/recurring-templates?include_paused=1' })
      .flush({ data: [aRecurringTemplate()] });
    expect((await list)[0]?.name).toBe('Luz');

    const one = firstValueFrom(api.get(4));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/recurring-templates/4' })
      .flush({ data: aRecurringTemplate() });
    expect((await one).id).toBe(4);
  });

  it('creates, updates and deletes templates', async () => {
    const created = firstValueFrom(api.create(input));
    const post = backend.expectOne({ method: 'POST', url: '/api/v1/recurring-templates' });
    expect(post.request.body).toEqual(input);
    post.flush({ data: aRecurringTemplate() }, { status: 201, statusText: 'Created' });
    expect((await created).id).toBe(4);

    const updated = firstValueFrom(api.update(4, { amount_cents: 7000 }));
    const patch = backend.expectOne({ method: 'PATCH', url: '/api/v1/recurring-templates/4' });
    expect(patch.request.body).toEqual({ amount_cents: 7000 });
    patch.flush({ data: aRecurringTemplate({ amount_cents: 7000 }) });
    expect((await updated).amount_cents).toBe(7000);

    const deleted = firstValueFrom(api.delete(4));
    backend
      .expectOne({ method: 'DELETE', url: '/api/v1/recurring-templates/4' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await deleted;
  });

  it('pauses and resumes a template', async () => {
    const paused = firstValueFrom(api.pause(4));
    backend
      .expectOne({ method: 'POST', url: '/api/v1/recurring-templates/4/pause' })
      .flush({ data: aRecurringTemplate({ paused_at: '2026-10-13T08:00:00+02:00' }) });
    expect((await paused).paused_at).not.toBeNull();

    const resumed = firstValueFrom(api.resume(4));
    backend
      .expectOne({ method: 'POST', url: '/api/v1/recurring-templates/4/resume' })
      .flush({ data: aRecurringTemplate() });
    expect((await resumed).paused_at).toBeNull();
  });

  it('reads the forecast of the current or a given period', async () => {
    const current = firstValueFrom(api.forecast());
    backend
      .expectOne({ method: 'GET', url: '/api/v1/recurring/forecast' })
      .flush({ data: aForecast() });
    expect((await current).pending_expense_cents).toBe(6000);

    const october = firstValueFrom(api.forecast('2026-10'));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/recurring/forecast?period=2026-10' })
      .flush({ data: aForecast() });
    expect((await october).period.label).toBe('2026-10');
  });
});
