import { TestBed } from '@angular/core/testing';
import { ConnectivityStatus } from './connectivity-status';

describe('ConnectivityStatus', () => {
  it('follows the browser online and offline events', () => {
    const status = TestBed.inject(ConnectivityStatus);
    expect(status.online()).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(status.online()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(status.online()).toBe(true);
  });
});
