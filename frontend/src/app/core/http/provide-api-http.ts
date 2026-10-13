import {
  HttpFeature,
  HttpFeatureKind,
  provideHttpClient,
  withInterceptors,
  withXsrfConfiguration,
} from '@angular/common/http';
import { EnvironmentProviders } from '@angular/core';
import { credentialsInterceptor } from './credentials.interceptor';
import { csrfRetryInterceptor } from './csrf-retry.interceptor';
import { unauthorizedInterceptor } from './unauthorized.interceptor';
import { XSRF_COOKIE_NAME, XSRF_HEADER_NAME } from './xsrf';

export const httpFeatures: HttpFeature<HttpFeatureKind>[] = [
  withXsrfConfiguration({ cookieName: XSRF_COOKIE_NAME, headerName: XSRF_HEADER_NAME }),
  withInterceptors([credentialsInterceptor, csrfRetryInterceptor, unauthorizedInterceptor]),
];

export function provideApiHttp(): EnvironmentProviders {
  return provideHttpClient(...httpFeatures);
}
