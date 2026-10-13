export interface E2eCredentials {
  email: string;
  password: string;
}

export function e2eCredentials(): E2eCredentials {
  return {
    email: process.env['E2E_USER_EMAIL'] ?? 'e2e@example.com',
    password: process.env['E2E_USER_PASSWORD'] ?? 'e2e-password-123',
  };
}

export function unknownEmail(): string {
  return `nobody-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}
