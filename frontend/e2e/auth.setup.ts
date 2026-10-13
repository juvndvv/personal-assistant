import { test as setup } from '@playwright/test';
import { authenticatedStatePath } from './auth-state';
import { logInAsE2eUser } from './session';

setup('authenticate the e2e user once', async ({ page }) => {
  await logInAsE2eUser(page);
  await page.context().storageState({ path: authenticatedStatePath });
});
