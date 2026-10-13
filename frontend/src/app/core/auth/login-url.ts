export const LOGIN_PATH = '/login';
export const HOME_PATH = '/';
export const UNAVAILABLE_PATH = '/sin-conexion';

export function loginUrlFor(returnUrl: string): string {
  const isMeaningfulReturn =
    returnUrl !== '' && returnUrl !== HOME_PATH && !returnUrl.startsWith(LOGIN_PATH);
  return isMeaningfulReturn
    ? `${LOGIN_PATH}?returnUrl=${encodeURIComponent(returnUrl)}`
    : LOGIN_PATH;
}

export function safeReturnUrl(candidate: string | null | undefined): string {
  return typeof candidate === 'string' && candidate.startsWith('/') && !candidate.startsWith('//')
    ? candidate
    : HOME_PATH;
}

export function unavailableUrlFor(returnUrl: string): string {
  const target = returnUrl.startsWith(UNAVAILABLE_PATH) ? HOME_PATH : safeReturnUrl(returnUrl);
  return `${UNAVAILABLE_PATH}?returnUrl=${encodeURIComponent(target)}`;
}
