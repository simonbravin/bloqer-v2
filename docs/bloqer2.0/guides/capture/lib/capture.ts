import type { Page } from "@playwright/test";
import { screenshotPath, VIEWPORT } from "./env";
import { assertNoNextjsOverlay, waitForAppReady } from "./auth";

export async function stableScreenshot(
  page: Page,
  filename: string,
  options?: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number } },
): Promise<string> {
  await page.setViewportSize(VIEWPORT);
  await waitForAppReady(page);
  await assertNoNextjsOverlay(page);

  const out = screenshotPath(filename);
  await page.screenshot({
    path: out,
    fullPage: options?.fullPage ?? false,
    clip: options?.clip,
    animations: "disabled",
  });
  return out;
}
