import AxeBuilder from '@axe-core/playwright';
import { Page } from '@playwright/test';

export const MIN_TAP_TARGET_PX = 44;

export interface SmallTarget {
  description: string;
  width: number;
  height: number;
}

export async function axeViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id}: ${node.target.join(' ')} (${node.failureSummary ?? ''})`,
    ),
  );
}

export async function smallTapTargets(page: Page): Promise<SmallTarget[]> {
  return page.evaluate((minimum) => {
    const selector = [
      'button',
      'a[href]',
      'select',
      'summary',
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])',
      '[role="button"]',
      '[role="tab"]',
      '[role="radio"]',
      '[role="menuitem"]',
    ].join(',');
    const hitArea = (element: Element): Element =>
      element.getAttribute('role') === 'switch' ? (element.closest('label') ?? element) : element;
    const inlineInText = (element: Element): boolean =>
      element.tagName === 'A' && getComputedStyle(element).display === 'inline';
    const describe = (element: Element): string => {
      const label =
        element.getAttribute('aria-label') ??
        element.textContent?.trim().replace(/\s+/g, ' ') ??
        '';
      return `${element.tagName.toLowerCase()} "${label.slice(0, 40)}"`;
    };
    return [...document.querySelectorAll(selector)]
      .filter((element) => !element.closest('[aria-hidden="true"], [inert], svg'))
      .filter((element) => !(element as HTMLButtonElement).disabled)
      .filter((element) => !inlineInText(element))
      .filter((element) => element.getAttribute('role') !== 'checkbox')
      .map((element) => ({ element, box: hitArea(element).getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .filter(({ box }) => box.width < minimum - 0.5 || box.height < minimum - 0.5)
      .map(({ element, box }) => ({
        description: describe(element),
        width: Math.round(box.width),
        height: Math.round(box.height),
      }));
  }, MIN_TAP_TARGET_PX);
}

export async function unlabelledControls(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], [role="button"]')]
      .filter((element) => !element.closest('[aria-hidden="true"]'))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      })
      .filter((element) => {
        const text = (element as HTMLElement).innerText?.trim() ?? '';
        const label = element.getAttribute('aria-label')?.trim() ?? '';
        const labelledBy = element.getAttribute('aria-labelledby');
        const title = element.getAttribute('title')?.trim() ?? '';
        return text === '' && label === '' && labelledBy === null && title === '';
      })
      .map((element) => element.outerHTML.slice(0, 160)),
  );
}
