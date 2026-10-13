import { HttpContextToken } from '@angular/common/http';

export const SKIP_UNAUTHORIZED_REDIRECT = new HttpContextToken<boolean>(() => false);
export const CSRF_RETRIED = new HttpContextToken<boolean>(() => false);
