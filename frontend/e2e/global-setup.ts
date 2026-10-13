import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '..', '..');

export default function resetLoginThrottle(): void {
  if (process.env['E2E_SKIP_STACK_RESET'] !== undefined) {
    return;
  }
  execFileSync('docker', ['compose', 'exec', '-T', 'web', 'php', 'artisan', 'cache:clear'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
}
