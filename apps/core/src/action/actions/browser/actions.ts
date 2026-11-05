import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer-extra';
import * as ChromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { harFromMessages } from 'chrome-har';

import {
  Browser,
  Page,
  KnownDevices,
  KeyInput,
  ElementHandle,
  CDPSession,
} from 'puppeteer-core';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

import { ElementDetails } from './ElementDetails';
import { FieldSelector, KnownDevice } from './BrowserTypes';
import { validations } from '@tipeline/schemas';

type LaunchParams = z.infer<typeof validations.browser.launch.runtime.schema>;
type CloseParams = z.infer<typeof validations.browser.close.runtime.schema>;
type EmulateDeviceParams = z.infer<typeof validations.browser.emulateDevice.runtime.schema>;
type SetGeolocationParams = z.infer<typeof validations.browser.setGeolocation.runtime.schema>;
type EmulateTimezoneParams = z.infer<typeof validations.browser.emulateTimezone.runtime.schema>;
type IsJavaScriptEnabledParams = z.infer<
  typeof validations.browser.isJavaScriptEnabled.runtime.schema
>;
type SetUserAgentParams = z.infer<typeof validations.browser.setUserAgent.runtime.schema>;
type GetUserAgentParams = z.infer<typeof validations.browser.getUserAgent.runtime.schema>;
type GoToParams = z.infer<typeof validations.browser.goTo.runtime.schema>;
type ReloadParams = z.infer<typeof validations.browser.reload.runtime.schema>;
type GoBackPageParams = z.infer<typeof validations.browser.goBackPage.runtime.schema>;
type GoForwardPageParams = z.infer<typeof validations.browser.goForwardPage.runtime.schema>;
type GetUrlParams = z.infer<typeof validations.browser.getUrl.runtime.schema>;
type GetPageTitleParams = z.infer<typeof validations.browser.getPageTitle.runtime.schema>;
type SetContentParams = z.infer<typeof validations.browser.setContent.runtime.schema>;
type SourceParams = z.infer<typeof validations.browser.source.runtime.schema>;
type HoverElementParams = z.infer<typeof validations.browser.hoverElement.runtime.schema>;
type ClickElementParams = z.infer<typeof validations.browser.clickElement.runtime.schema>;
type FocusElementParams = z.infer<typeof validations.browser.focusElement.runtime.schema>;
type TypeInElementParams = z.infer<typeof validations.browser.typeInElement.runtime.schema>;
type GetElementParams = z.infer<typeof validations.browser.getElement.runtime.schema>;
type GetElementsParams = z.infer<typeof validations.browser.getElements.runtime.schema>;
type ExtractStructuredDataParams = z.infer<
  typeof validations.browser.extractStructuredData.runtime.schema
>;
type SetCheckStateParams = z.infer<typeof validations.browser.setCheckState.runtime.schema>;
type GetCheckStateParams = z.infer<typeof validations.browser.getCheckState.runtime.schema>;
type SetSelectStateParams = z.infer<typeof validations.browser.setSelectState.runtime.schema>;
type GetSelectStateParams = z.infer<typeof validations.browser.getSelectState.runtime.schema>;
type ContainsParams = z.infer<typeof validations.browser.contains.runtime.schema>;
type RunJavaScriptParams = z.infer<typeof validations.browser.runJavaScript.runtime.schema>;
type TakeScreenshotParams = z.infer<typeof validations.browser.takeScreenshot.runtime.schema>;
type TakeScreenshotElementParams = z.infer<
  typeof validations.browser.takeScreenshotElement.runtime.schema
>;
type StartScreencastParams = z.infer<typeof validations.browser.startScreencast.runtime.schema>;
type StopScreencastParams = z.infer<typeof validations.browser.stopScreencast.runtime.schema>;
type GeneratePDFParams = z.infer<typeof validations.browser.generatePDF.runtime.schema>;
type WaitParams = z.infer<typeof validations.browser.wait.runtime.schema>;
type MetadataParams = z.infer<typeof validations.browser.metadata.runtime.schema>;
type AddStyleTagParams = z.infer<typeof validations.browser.addStyleTag.runtime.schema>;
type GetCookiesParams = z.infer<typeof validations.browser.getCookies.runtime.schema>;
type SetCookiesParams = z.infer<typeof validations.browser.setCookies.runtime.schema>;
type DeleteCookiesParams = z.infer<typeof validations.browser.deleteCookies.runtime.schema>;
type GetViewportParams = z.infer<typeof validations.browser.getViewport.runtime.schema>;
type SetViewportParams = z.infer<typeof validations.browser.setViewport.runtime.schema>;
type KeyboardTypeParams = z.infer<typeof validations.browser.keyboardType.runtime.schema>;
type KeyboardDownParams = z.infer<typeof validations.browser.keyboardDown.runtime.schema>;
type KeyboardUpParams = z.infer<typeof validations.browser.keyboardUp.runtime.schema>;
type KeyboardPressParams = z.infer<typeof validations.browser.keyboardPress.runtime.schema>;
type KeyboardSendCharacterParams = z.infer<
  typeof validations.browser.keyboardSendCharacter.runtime.schema
>;
type MouseClickParams = z.infer<typeof validations.browser.mouseClick.runtime.schema>;
type MouseDownParams = z.infer<typeof validations.browser.mouseDown.runtime.schema>;
type MouseUpParams = z.infer<typeof validations.browser.mouseUp.runtime.schema>;
type MouseMoveParams = z.infer<typeof validations.browser.mouseMove.runtime.schema>;
type MouseWheelParams = z.infer<typeof validations.browser.mouseWheel.runtime.schema>;
type DragAndDropByCoordinatesParams = z.infer<
  typeof validations.browser.dragAndDropByCoordinates.runtime.schema
>;
type DragAndDropByElementsParams = z.infer<
  typeof validations.browser.dragAndDropByElements.runtime.schema
>;
type UploadFileParams = z.infer<typeof validations.browser.uploadFile.runtime.schema>;
type DownloadFileParams = z.infer<typeof validations.browser.downloadFile.runtime.schema>;
type SetCacheEnabledParams = z.infer<typeof validations.browser.setCacheEnabled.runtime.schema>;
type RunLighthouseAuditParams = z.infer<
  typeof validations.browser.runLighthouseAudit.runtime.schema
>;
type StartHarCaptureParams = z.infer<typeof validations.browser.startHarCapture.runtime.schema>;
type StopHarCaptureParams = z.infer<typeof validations.browser.stopHarCapture.runtime.schema>;

// CDP events chrome-har's harFromMessages() knows how to fold into a HAR — see
// https://github.com/sitespeedio/chrome-har. Deliberately excludes the request-interception
// events needed for response bodies; this capture is headers/timing/cache/cookies only.
const HAR_CAPTURE_EVENTS = [
  'Page.frameStartedLoading',
  'Page.frameRequestedNavigation',
  'Page.navigatedWithinDocument',
  'Page.loadEventFired',
  'Page.domContentEventFired',
  'Page.frameAttached',
  'Network.requestWillBeSent',
  'Network.requestServedFromCache',
  'Network.requestWillBeSentExtraInfo',
  'Network.responseReceivedExtraInfo',
  'Network.responseReceived',
  'Network.dataReceived',
  'Network.loadingFinished',
  'Network.loadingFailed',
  'Network.resourceChangedPriority',
] as const;

interface HarCaptureHandle {
  client: CDPSession;
  messages: Array<{ method: string; params: any }>;
  handlers: Map<string, (params: any) => void>;
}

/**
 * @group Actions
 */
export class GroupBrowser {
  // Keyed by the opaque id handed to the pipeline from startHarCapture. Holds the live
  // CDPSession/listeners so pipeline variables never carry non-cloneable values (see
  // startHarCapture's doc comment for why).
  private static harCaptures = new Map<string, HarCaptureHandle>();

  // Lighthouse instruments navigation with Node's perf_hooks performance.mark()/measure()
  // under fixed, process-global names (e.g. 'lh:driver:navigate') rather than per-call
  // scoped ones. Two audits running concurrently in this process (e.g. two subtask.exec
  // (async: true) calls both hitting runLighthouseAudit) can have one audit's mark/clear
  // stomp the other's, surfacing as "The ... performance mark has not been set". This chain
  // serializes only the actual lighthouse() calls in this process so concurrent audits queue
  // instead of colliding — everything else about the action stays concurrent as normal.
  private static lighthouseQueue: Promise<unknown> = Promise.resolve();

  //--------------------------------------------------
  // Private helpers
  //--------------------------------------------------

  private static findChrome(): string {
    const installations = ChromeLauncher.Launcher.getInstallations();

    if (installations.length === 0) {
      throw new Error(
        'Chrome not found. Please install Chrome:\n' +
          '  • Chrome: https://www.google.com/chrome/\n' +
          '  • Chromium: https://www.chromium.org/getting-involved/download-chromium/\n\n' +
          'Or specify a custom path in your configuration.'
      );
    }

    return installations[0];
  }

  private static async getActivePage(browser: Browser): Promise<Page> {
    const pages = await browser.pages();
    if (pages.length === 0) throw new Error('No open pages found in the browser instance');
    return pages[0];
  }

  private static formatSelector(selector: string, type: string = 'css'): string {
    switch (type) {
      case 'xpath':
        return `::-p-xpath(${selector})`;
      case 'aria':
        return `::-p-aria(${selector})`;
      case 'text':
        return `::-p-text(${selector})`;
      case 'css':
      default:
        return selector;
    }
  }

  //--------------------------------------------------
  // Browser Control
  //--------------------------------------------------

  /**
   * Launches a new browser instance using a locally installed Chrome or Chromium.
   *
   * @param params - The input parameters.
   * @returns The Puppeteer `Browser` instance.
   * @example
   * ```yaml
   * # Launch a headless browser at 1280×720 and store it in browserInstance
   * - group: browser
   *   name: launch
   *   params:
   *     headless: true
   *     timeout: 30000
   *     viewport:
   *       width: 1280
   *       height: 720
   *       isMobile: false
   *       isLandscape: false
   *   destination: browserInstance
   * ```
   */
  static async launch(params: LaunchParams): Promise<any> {
    const parsed = validations.browser.launch.runtime.validate(params);
    const chromePath = parsed.chromePath || GroupBrowser.findChrome();

    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: (parsed.headless ?? true) as unknown as boolean | 'chrome',
      timeout: parsed.timeout ?? 30000,
      defaultViewport: {
        width: parsed.viewport?.width ?? 1280,
        height: parsed.viewport?.height ?? 720,
        isMobile: parsed.viewport?.isMobile ?? false,
        isLandscape: parsed.viewport?.isLandscape ?? false,
      },
    });

    return browser;
  }

  /**
   * Closes an open browser instance and frees its resources.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * # Close the browser at the end of the pipeline
   * - group: browser
   *   name: close
   *   params:
   *     browser: '{= browserInstance =}'
   * ```
   */
  static async close(params: CloseParams): Promise<void> {
    const parsed = validations.browser.close.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    await browser.close();
  }

  /**
   * Emulates a predefined device profile, overriding viewport, user agent, and touch support.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * # Emulate an iPhone 15 to test mobile rendering
   * - group: browser
   *   name: emulateDevice
   *   params:
   *     browser: '{= browserInstance =}'
   *     device: 'iPhone 15'
   * ```
   */
  static async emulateDevice(params: EmulateDeviceParams): Promise<void> {
    const parsed = validations.browser.emulateDevice.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    const knownDevice = KnownDevices[parsed.device as KnownDevice];
    await page.emulate(knownDevice);
  }

  /**
   * Overrides the GPS coordinates reported to the page via the Geolocation API.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * # Set geolocation to San Francisco
   * - group: browser
   *   name: setGeolocation
   *   params:
   *     browser: '{= browserInstance =}'
   *     coordinates:
   *       latitude: 37.7749
   *       longitude: -122.4194
   *       accuracy: 50
   * ```
   */
  static async setGeolocation(params: SetGeolocationParams): Promise<void> {
    const parsed = validations.browser.setGeolocation.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.setGeolocation(parsed.coordinates);
  }

  /**
   * Overrides the timezone reported by the JavaScript `Date` API.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * # Force the page to use the New York timezone
   * - group: browser
   *   name: emulateTimezone
   *   params:
   *     browser: '{= browserInstance =}'
   *     timezoneId: 'America/New_York'
   * ```
   */
  static async emulateTimezone(params: EmulateTimezoneParams): Promise<void> {
    const parsed = validations.browser.emulateTimezone.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.emulateTimezone(parsed.timezoneId);
  }

  /**
   * Returns whether JavaScript execution is currently enabled for the page.
   *
   * @param params - The input parameters.
   * @returns `true` if JavaScript is enabled, otherwise `false`.
   * @example
   * ```yaml
   * - group: browser
   *   name: isJavaScriptEnabled
   *   params:
   *     browser: '{= browserInstance =}'
   *   destination: jsEnabled
   * ```
   */
  static async isJavaScriptEnabled(params: IsJavaScriptEnabledParams): Promise<boolean> {
    const parsed = validations.browser.isJavaScriptEnabled.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    return page.isJavaScriptEnabled();
  }

  /**
   * Sets a custom User-Agent string for all requests made by the page.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * # Override the user agent to simulate a custom bot
   * - group: browser
   *   name: setUserAgent
   *   params:
   *     browser: '{= browserInstance =}'
   *     userAgent: 'Mozilla/5.0 (compatible; Tipeline/1.0)'
   * ```
   */
  static async setUserAgent(params: SetUserAgentParams): Promise<void> {
    const parsed = validations.browser.setUserAgent.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.setUserAgent(parsed.userAgent);
  }

  /**
   * Returns the current User-Agent string reported by `navigator.userAgent`.
   *
   * @param params - The input parameters.
   * @returns The current user agent string.
   * @example
   * ```yaml
   * - group: browser
   *   name: getUserAgent
   *   params:
   *     browser: '{= browserInstance =}'
   *   destination: userAgent
   * ```
   */
  static async getUserAgent(params: GetUserAgentParams): Promise<string> {
    const parsed = validations.browser.getUserAgent.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    return (await page.evaluate(`navigator.userAgent`)) as string;
  }

  /**
   * Enables or disables the browser's own HTTP cache for the current page. Disable it
   * before a request when you need to guarantee a real network round-trip instead of a
   * response served from Chrome's disk/memory cache.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Force the next navigation to hit the network, bypassing the browser's own cache
   * - group: browser
   *   name: setCacheEnabled
   *   params:
   *     browser: '{= browserInstance =}'
   *     enabled: false
   * ```
   */
  static async setCacheEnabled(params: SetCacheEnabledParams): Promise<boolean> {
    const parsed = validations.browser.setCacheEnabled.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.setCacheEnabled(parsed.enabled);
    return true;
  }

  //--------------------------------------------------
  // Page Navigation
  //--------------------------------------------------

  /**
   * Navigates the browser to a URL or a local HTML file path.
   *
   * @param params - The input parameters.
   * @returns The full response details: status, statusText, ok, url, headers, remoteAddress,
   * fromCache, fromServiceWorker, and timing.
   * @example
   * ```yaml
   * # Navigate to a URL and wait for the DOM to be ready
   * - group: browser
   *   name: goTo
   *   params:
   *     browser: '{= browserInstance =}'
   *     url: 'https://example.com'
   *     waitUntil: domcontentloaded
   *     timeout: 30000
   *   destination: response
   * # response.status, response.headers['x-drupal-cache'], response.remoteAddress, ...
   * ```
   */
  static async goTo(params: GoToParams): Promise<any> {
    const parsed = validations.browser.goTo.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    let target = parsed.url;

    if (fs.existsSync(target)) {
      target = pathToFileURL(target).href;
    }

    const navigationOptions: any = {};

    if (parsed.waitUntil) {
      navigationOptions.waitUntil = parsed.waitUntil;
    }

    if (parsed.timeout !== undefined) {
      navigationOptions.timeout = parsed.timeout;
    }

    const response = await page.goto(target, navigationOptions);

    // page.goto() can resolve to null — e.g. a same-document navigation (hash change,
    // history.pushState) or a client-side redirect that never produces a new main
    // resource response. There's still a real page loaded at this point, just no
    // response object to report on.
    if (!response) {
      return {
        status: null,
        statusText: null,
        ok: null,
        url: page.url(),
        headers: null,
        remoteAddress: null,
        fromCache: null,
        fromServiceWorker: null,
        timing: null,
      };
    }

    return {
      status: response.status(),
      statusText: response.statusText(),
      ok: response.ok(),
      url: response.url(),
      headers: response.headers(),
      remoteAddress: response.remoteAddress(),
      fromCache: response.fromCache(),
      fromServiceWorker: response.fromServiceWorker(),
      timing: response.timing(),
    };
  }

  /**
   * Reloads the current page.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * # Reload and wait for the lenient "no more than 2 connections" condition — the
   * # strict `wait: networkidle` action (zero connections) can hang indefinitely on
   * # real sites with persistent background chatter (analytics, ads, chat widgets).
   * - group: browser
   *   name: reload
   *   params:
   *     browser: '{= browserInstance =}'
   *     waitUntil: networkidle2
   *     timeout: 30000
   * ```
   */
  static async reload(params: ReloadParams): Promise<any> {
    const parsed = validations.browser.reload.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    const navigationOptions: any = {};
    if (parsed.waitUntil) navigationOptions.waitUntil = parsed.waitUntil;
    if (parsed.timeout !== undefined) navigationOptions.timeout = parsed.timeout;

    return await page.reload(navigationOptions);
  }

  /**
   * Navigates back one step in the browser history.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * - group: browser
   *   name: goBackPage
   *   params:
   *     browser: '{= browserInstance =}'
   * ```
   */
  static async goBackPage(params: GoBackPageParams): Promise<any> {
    const parsed = validations.browser.goBackPage.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    return await page.goBack({ waitUntil: 'domcontentloaded' });
  }

  /**
   * Navigates forward one step in the browser history.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * - group: browser
   *   name: goForwardPage
   *   params:
   *     browser: '{= browserInstance =}'
   * ```
   */
  static async goForwardPage(params: GoForwardPageParams): Promise<any> {
    const parsed = validations.browser.goForwardPage.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    return await page.goForward({ waitUntil: 'domcontentloaded' });
  }

  /**
   * Returns the current page URL.
   *
   * @param params - The input parameters.
   * @returns The current URL string.
   * @example
   * ```yaml
   * - group: browser
   *   name: getUrl
   *   params:
   *     browser: '{= browserInstance =}'
   *   destination: currentUrl
   * ```
   */
  static async getUrl(params: GetUrlParams): Promise<string> {
    const parsed = validations.browser.getUrl.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    return page.url();
  }

  /**
   * Returns the current page `<title>`.
   *
   * @param params - The input parameters.
   * @returns The page title string.
   * @example
   * ```yaml
   * - group: browser
   *   name: getPageTitle
   *   params:
   *     browser: '{= browserInstance =}'
   *   destination: pageTitle
   * ```
   */
  static async getPageTitle(params: GetPageTitleParams): Promise<string> {
    const parsed = validations.browser.getPageTitle.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    return await page.title();
  }

  /**
   * Replaces the entire page content with a custom HTML string.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * # Inject a custom HTML page for testing or rendering
   * - group: browser
   *   name: setContent
   *   params:
   *     browser: '{= browserInstance =}'
   *     content: '<h1>Hello Tipeline</h1>'
   * ```
   */
  static async setContent(params: SetContentParams): Promise<void> {
    const parsed = validations.browser.setContent.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.setContent(parsed.content, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Returns the full outer HTML source of the current page.
   *
   * @param params - The input parameters.
   * @returns The page HTML as a string.
   * @example
   * ```yaml
   * - group: browser
   *   name: source
   *   params:
   *     browser: '{= browserInstance =}'
   *   destination: pageHtml
   * ```
   */
  static async source(params: SourceParams): Promise<string> {
    const parsed = validations.browser.source.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    return await page.content();
  }

  //--------------------------------------------------
  // Element Actions
  //--------------------------------------------------

  /**
   * Moves the mouse cursor over an element without clicking it.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Hover over a nav dropdown to reveal its sub-menu
   * - group: browser
   *   name: hoverElement
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#main-nav .dropdown'
   *     selectorType: css
   * ```
   */
  static async hoverElement(params: HoverElementParams): Promise<boolean> {
    const parsed = validations.browser.hoverElement.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.locator(selector).hover();
    return true;
  }

  /**
   * Clicks an element, with optional waiting strategy before or after the click.
   *
   * Supported `waitFor.type` values:
   * - `timeout` — wait for a selector to appear before clicking
   * - `selector` — click then wait for another selector to appear
   * - `navigation` — click then wait for navigation to complete
   * - `networkidle` — click then wait for no pending network requests
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Click a submit button and wait for navigation to complete
   * - group: browser
   *   name: clickElement
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#submit-btn'
   *     selectorType: css
   *     waitFor:
   *       type: navigation
   * ```
   */
  static async clickElement(params: ClickElementParams): Promise<boolean> {
    const parsed = validations.browser.clickElement.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const locator = page.locator(selector);

    if (parsed.waitFor) {
      const { type } = parsed.waitFor;

      switch (type) {
        case 'timeout':
          await page.waitForSelector(selector, { timeout: parsed.waitFor.timeout ?? 1000 });
          await locator.click();
          break;
        case 'selector': {
          if (!parsed.waitFor.selector) throw new Error("Selector is required for type 'selector'");
          const waitForSelector = GroupBrowser.formatSelector(
            parsed.waitFor.selector,
            parsed.waitFor.selectorType
          );
          await Promise.all([page.waitForSelector(waitForSelector), locator.click()]);
          break;
        }
        case 'navigation':
          await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), locator.click()]);
          break;
        case 'networkidle':
          await Promise.all([page.waitForNetworkIdle(), locator.click()]);
          break;
      }
    } else {
      await locator.click();
    }

    return true;
  }

  /**
   * Gives keyboard focus to an element.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: focusElement
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#search-input'
   *     selectorType: css
   * ```
   */
  static async focusElement(params: FocusElementParams): Promise<boolean> {
    const parsed = validations.browser.focusElement.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.waitForSelector(selector);
    await page.focus(selector);
    return true;
  }

  /**
   * Types a string into an element character by character, simulating keyboard input.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Type a search query into the search box
   * - group: browser
   *   name: typeInElement
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#search-input'
   *     selectorType: css
   *     text: 'browser automation'
   * ```
   */
  static async typeInElement(params: TypeInElementParams): Promise<boolean> {
    const parsed = validations.browser.typeInElement.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.waitForSelector(selector);
    await page.type(selector, parsed.text);
    return true;
  }

  /**
   * Reads a specific attribute or text from a single element.
   *
   * Supported `attribute` values: `text`, `id`, `class`, `title`, `href`, `src`,
   * `enabled`, `visible`, `exists`, `ordinal`, `innerHTML`, `innerText`, `data-*`, `aria-*`.
   *
   * The optional `waitFor` block controls when to begin reading:
   * - `timeout` — wait for the element to appear before reading
   * - `selector` — wait for a different selector first
   * - `navigation` — wait for navigation to complete
   * - `networkidle` — wait for network to go idle
   *
   * @param params - The input parameters.
   * @returns The attribute value, or `false` if the element is not found and attribute is `exists`.
   * @example
   * ```yaml
   * # Read the heading text after the page loads
   * - group: browser
   *   name: getElement
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#firstHeading'
   *     selectorType: css
   *     attribute: text
   *   destination: headingText
   * ```
   */
  static async getElement(params: GetElementParams): Promise<string | boolean> {
    const parsed = validations.browser.getElement.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);

    if (parsed.waitFor) {
      const { type } = parsed.waitFor;

      switch (type) {
        case 'timeout':
          await page.waitForSelector(selector, { timeout: parsed.waitFor.timeout ?? 1000 });
          break;
        case 'selector': {
          if (!parsed.waitFor.selector) throw new Error("Selector is required for type 'selector'");
          const waitForSelector = GroupBrowser.formatSelector(
            parsed.waitFor.selector,
            parsed.waitFor.selectorType
          );
          await page.waitForSelector(waitForSelector);
          break;
        }
        case 'navigation':
          await page.waitForNavigation({ waitUntil: 'load' });
          break;
        case 'networkidle':
          await page.waitForNetworkIdle();
          break;
      }
    } else {
      await page.waitForSelector(selector);
    }

    const elementHandle = await page.$(selector);
    return await ElementDetails.getAttributeValue(elementHandle, parsed.attribute);
  }

  /**
   * Reads an attribute or text from all elements matching a selector, returning an array.
   *
   * @param params - The input parameters.
   * @returns An array of non-empty string values from the matching elements.
   * @example
   * ```yaml
   * # Collect all link texts from a results list
   * - group: browser
   *   name: getElements
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: 'ul.results li a'
   *     selectorType: css
   *     attribute: text
   *   destination: resultItems
   * ```
   */
  static async getElements(params: GetElementsParams): Promise<string[]> {
    const parsed = validations.browser.getElements.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.waitForSelector(selector);
    const elements = await page.$$(selector);

    const results: string[] = [];
    for (const element of elements) {
      const value = await ElementDetails.getAttributeValue(element, parsed.attribute || 'text');
      if (typeof value === 'string' && value !== '') {
        results.push(value);
      } else if (typeof value === 'boolean') {
        results.push(value.toString());
      }
    }

    return results;
  }

  /**
   * Scrapes a repeated set of DOM elements into a 2-D array of field values.
   *
   * Each row corresponds to one `itemSelector` match. Within each row, each column
   * corresponds to one entry in `fieldSelectors`, read from the matched child element.
   *
   * @param params - The input parameters.
   * @returns A 2-D array where each inner array is one scraped row of field values.
   * @example
   * ```yaml
   * # Scrape a product table — each row yields [name, price, link]
   * - group: browser
   *   name: extractStructuredData
   *   params:
   *     browser: '{= browserInstance =}'
   *     itemSelector: 'table.products tr'
   *     selectorType: css
   *     fieldSelectors:
   *       - selector: 'td.name'
   *         selectorType: css
   *         attribute: text
   *       - selector: 'td.price'
   *         selectorType: css
   *         attribute: text
   *       - selector: 'td a'
   *         selectorType: css
   *         attribute: href
   *   destination: productRows
   * ```
   */
  static async extractStructuredData(params: ExtractStructuredDataParams): Promise<any[][]> {
    const parsed = validations.browser.extractStructuredData.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const itemSelector = GroupBrowser.formatSelector(parsed.itemSelector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.waitForSelector(itemSelector);

    const rows = await page.$$(itemSelector);
    const result: any[][] = [];

    for (const row of rows) {
      const rowData: any[] = [];

      for (const {
        selector,
        selectorType = 'css',
        attribute = 'text',
      } of parsed.fieldSelectors as FieldSelector[]) {
        const fieldSelector = GroupBrowser.formatSelector(selector, selectorType);
        const elementHandle = await row.$(fieldSelector);
        const value = await ElementDetails.getAttributeValue(elementHandle, attribute);
        rowData.push(value);
      }

      result.push(rowData);
    }

    return result;
  }

  /**
   * Sets a checkbox or ARIA checkbox element to a checked or unchecked state.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Accept terms and conditions
   * - group: browser
   *   name: setCheckState
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#agree-terms'
   *     selectorType: css
   *     checked: true
   * ```
   */
  static async setCheckState(params: SetCheckStateParams): Promise<boolean> {
    const parsed = validations.browser.setCheckState.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.waitForSelector(selector);
    await page.$eval(
      selector,
      (el, checked) => {
        (el as HTMLInputElement).checked = checked;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      parsed.checked
    );
    return true;
  }

  /**
   * Reads the checked state of a native checkbox or ARIA checkbox element.
   *
   * @param params - The input parameters.
   * @returns `true` if checked, `false` otherwise.
   * @example
   * ```yaml
   * - group: browser
   *   name: getCheckState
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#agree-terms'
   *     selectorType: css
   *   destination: isChecked
   * ```
   */
  static async getCheckState(params: GetCheckStateParams): Promise<boolean> {
    const parsed = validations.browser.getCheckState.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.waitForSelector(selector);

    return await page.$eval(selector, (el) => {
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        return el.checked;
      }

      if (el.getAttribute('role') === 'checkbox') {
        const ariaChecked = el.getAttribute('aria-checked');
        return ariaChecked === 'true' || ariaChecked === 'mixed';
      }

      return false;
    });
  }

  /**
   * Selects one or more options in a `<select>` element by their value attributes.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Select a country from a dropdown
   * - group: browser
   *   name: setSelectState
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#country-select'
   *     selectorType: css
   *     value: 'US'
   * ```
   */
  static async setSelectState(params: SetSelectStateParams): Promise<boolean> {
    const parsed = validations.browser.setSelectState.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.waitForSelector(selector);
    const values = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
    await page.select(selector, ...values);
    return true;
  }

  /**
   * Returns the currently selected option values from a `<select>` element.
   *
   * @param params - The input parameters.
   * @returns An array of selected option `value` strings.
   * @example
   * ```yaml
   * - group: browser
   *   name: getSelectState
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#country-select'
   *     selectorType: css
   *   destination: selectedCountries
   * ```
   */
  static async getSelectState(params: GetSelectStateParams): Promise<string[]> {
    const parsed = validations.browser.getSelectState.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.waitForSelector(selector);
    return await page.$eval(selector, (el) => {
      return Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.value);
    });
  }

  /**
   * Asserts presence or absence of an element or text substring on the current page.
   *
   * Supported `mode` values:
   * - `contain-element` — returns `true` if the selector matches at least one element
   * - `not-contain-element` — returns `true` if no element matches the selector
   * - `contain-text` — returns `true` if the page HTML contains the text
   * - `not-contain-text` — returns `true` if the page HTML does not contain the text
   *
   * @param params - The input parameters.
   * @returns `true` if the condition is met, `false` otherwise.
   * @example
   * ```yaml
   * # Check whether a welcome message is visible after login
   * - group: browser
   *   name: contains
   *   params:
   *     browser: '{= browserInstance =}'
   *     mode: contain-text
   *     value: 'Welcome back'
   *   destination: hasWelcome
   * ```
   */
  static async contains(params: ContainsParams): Promise<boolean> {
    const parsed = validations.browser.contains.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    const { mode, value, selectorType = 'css' } = parsed;

    if (mode === 'contain-element') {
      const selector = GroupBrowser.formatSelector(value, selectorType);
      return (await page.$(selector)) !== null;
    }

    if (mode === 'not-contain-element') {
      const selector = GroupBrowser.formatSelector(value, selectorType);
      return (await page.$(selector)) === null;
    }

    const pageText = await page.content();

    if (mode === 'contain-text') return pageText.includes(value);
    if (mode === 'not-contain-text') return !pageText.includes(value);

    return false;
  }

  /**
   * Executes a JavaScript snippet inside the page context, with optional variable bindings.
   *
   * The `context` object is serialized and its keys are destructured into the script scope,
   * so values from the pipeline can be passed in without `eval` string interpolation.
   * The script must use `return` to produce a value.
   *
   * @param params - The input parameters.
   * @returns Whatever value the script returns.
   * @example
   * ```yaml
   * # Collect all visible link hrefs from the page
   * - group: browser
   *   name: runJavaScript
   *   params:
   *     browser: '{= browserInstance =}'
   *     script: |
   *       const items = document.querySelectorAll('.item');
   *       return Array.from(items).map(el => el.textContent.trim());
   *   destination: itemTexts
   * ```
   * @example
   * ```yaml
   * # Pass pipeline variables into the script via context
   * - group: browser
   *   name: runJavaScript
   *   params:
   *     browser: '{= browserInstance =}'
   *     script: |
   *       return greeting + ', ' + name + '!';
   *     context:
   *       greeting: Hello
   *       name: Tipeline
   *   destination: message
   * ```
   */
  static async runJavaScript(params: RunJavaScriptParams): Promise<any> {
    const parsed = validations.browser.runJavaScript.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    const context = parsed.context ?? {};
    const keys = Object.keys(context);
    const destructure = keys.length > 0 ? `const { ${keys.join(', ')} } = context;` : '';

    const functionBody = `
      ${destructure}
      return (async () => {
        ${parsed.script}
      })();
    `;

    return await page.evaluate(
      async (code, ctx) => {
        const asyncFn = new Function('context', code);
        return await asyncFn(ctx ?? {});
      },
      functionBody,
      context
    );
  }

  //--------------------------------------------------
  // Page Content
  //--------------------------------------------------

  /**
   * Captures a screenshot of the full page or visible viewport and saves it to disk.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Save a full-page JPEG screenshot
   * - group: browser
   *   name: takeScreenshot
   *   params:
   *     browser: '{= browserInstance =}'
   *     options:
   *       path: /tmp/screenshot.jpg
   *       fullPage: true
   *       quality: 85
   *       type: jpeg
   * ```
   */
  static async takeScreenshot(params: TakeScreenshotParams): Promise<boolean> {
    const parsed = validations.browser.takeScreenshot.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.screenshot(parsed.options as any);
    return true;
  }

  /**
   * Captures a screenshot of a single DOM element and saves it to disk.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Screenshot just the hero banner element
   * - group: browser
   *   name: takeScreenshotElement
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '.hero-banner'
   *     selectorType: css
   *     options:
   *       path: /tmp/banner.jpg
   *       quality: 85
   *       type: jpeg
   * ```
   */
  static async takeScreenshotElement(params: TakeScreenshotElementParams): Promise<boolean> {
    const parsed = validations.browser.takeScreenshotElement.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);

    const element = await page.waitForSelector(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);

    await element.screenshot(parsed.options as any);
    return true;
  }

  /**
   * Starts recording the browser viewport to a video file. Store the returned recorder
   * in a variable and pass it to `stopScreencast` when done.
   *
   * Note: screencast requires headful mode (`headless: false`) or the new Chromium
   * headless mode (`headless: 'shell'`) — the legacy headless mode disables the GPU
   * compositor, causing blank recordings.
   *
   * @param params - The input parameters.
   * @returns The screencast recorder handle (pass to `stopScreencast`).
   * @example
   * ```yaml
   * - group: browser
   *   name: startScreencast
   *   params:
   *     browser: '{= browserInstance =}'
   *     options:
   *       path: /tmp/recording.mp4
   *   destination: recorderInstance
   * ```
   */
  static async startScreencast(params: StartScreencastParams): Promise<any> {
    const parsed = validations.browser.startScreencast.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    return await page.screencast(parsed.options as any);
  }

  /**
   * Stops an active screencast recording and finalizes the output file.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: stopScreencast
   *   params:
   *     browser: '{= browserInstance =}'
   *     recorder: '{= recorderInstance =}'
   * ```
   */
  static async stopScreencast(params: StopScreencastParams): Promise<boolean> {
    const parsed = validations.browser.stopScreencast.runtime.validate(params);
    await parsed.recorder.stop();
    return true;
  }

  /**
   * Exports the current page to a PDF file.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Export to A4 PDF with background colors preserved
   * - group: browser
   *   name: generatePDF
   *   params:
   *     browser: '{= browserInstance =}'
   *     options:
   *       path: /tmp/page.pdf
   *       format: A4
   *       printBackground: true
   *       landscape: false
   * ```
   */
  static async generatePDF(params: GeneratePDFParams): Promise<boolean> {
    const parsed = validations.browser.generatePDF.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.pdf(parsed.options as any);
    return true;
  }

  /**
   * Pauses execution until a condition is met.
   *
   * Supported `type` values:
   * - `timeout` — wait a fixed number of milliseconds
   * - `selector` — wait until an element appears in the DOM
   * - `navigation` — wait until the page finishes navigating
   * - `networkidle` — wait until there are no pending network requests
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Wait 2 seconds before the next action
   * - group: browser
   *   name: wait
   *   params:
   *     browser: '{= browserInstance =}'
   *     type: timeout
   *     timeout: 2000
   * ```
   * @example
   * ```yaml
   * # Wait for a results container to appear in the DOM
   * - group: browser
   *   name: wait
   *   params:
   *     browser: '{= browserInstance =}'
   *     type: selector
   *     selector: '#results-container'
   *     selectorType: css
   * ```
   */
  static async wait(params: WaitParams): Promise<boolean> {
    const parsed = validations.browser.wait.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    switch (parsed.type) {
      case 'timeout':
        await new Promise((resolve) => setTimeout(resolve, parsed.timeout ?? 1000));
        break;
      case 'selector': {
        if (!parsed.selector) throw new Error("Selector is required for type 'selector'");
        const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
        await page.waitForSelector(selector);
        break;
      }
      case 'navigation':
        await page.waitForNavigation({ waitUntil: 'load' });
        break;
      case 'networkidle':
        await page.waitForNetworkIdle();
        break;
    }

    return true;
  }

  /**
   * Reads the `content` attribute of one or more `<meta name="…">` tags.
   *
   * @param params - The input parameters.
   * @returns An array of `content` values from all matching meta tags.
   * @example
   * ```yaml
   * # Read the page's SEO description meta tag
   * - group: browser
   *   name: metadata
   *   params:
   *     browser: '{= browserInstance =}'
   *     name: description
   *   destination: metaDescription
   * ```
   */
  static async metadata(params: MetadataParams): Promise<string[]> {
    const parsed = validations.browser.metadata.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    return await page.evaluate((name) => {
      return Array.from(document.querySelectorAll(`meta[name="${name}"]`)).map(
        (e) => (e as HTMLMetaElement).content
      );
    }, parsed.name);
  }

  /**
   * Injects a CSS `<style>` tag into the page, overriding or extending existing styles.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Inject CSS to highlight all links before taking a screenshot
   * - group: browser
   *   name: addStyleTag
   *   params:
   *     browser: '{= browserInstance =}'
   *     css: 'a { outline: 2px solid red; }'
   * ```
   */
  static async addStyleTag(params: AddStyleTagParams): Promise<boolean> {
    const parsed = validations.browser.addStyleTag.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.addStyleTag({ content: parsed.css });
    return true;
  }

  //--------------------------------------------------
  // Cookies
  //--------------------------------------------------

  /**
   * Returns all cookies currently set in the browser.
   *
   * @param params - The input parameters.
   * @returns An array of cookie objects.
   * @example
   * ```yaml
   * - group: browser
   *   name: getCookies
   *   params:
   *     browser: '{= browserInstance =}'
   *   destination: allCookies
   * ```
   */
  static async getCookies(params: GetCookiesParams): Promise<any[]> {
    const parsed = validations.browser.getCookies.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    return await browser.cookies();
  }

  /**
   * Sets one or more cookies in the browser.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * # Inject an auth session cookie before navigating to a protected page
   * - group: browser
   *   name: setCookies
   *   params:
   *     browser: '{= browserInstance =}'
   *     cookies:
   *       - name: session_id
   *         value: abc123xyz
   *         domain: example.com
   * ```
   */
  static async setCookies(params: SetCookiesParams): Promise<void> {
    const parsed = validations.browser.setCookies.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    await browser.setCookie(...parsed.cookies);
  }

  /**
   * Deletes one or more cookies from the browser.
   *
   * @param params - The input parameters.
   * @example
   * ```yaml
   * - group: browser
   *   name: deleteCookies
   *   params:
   *     browser: '{= browserInstance =}'
   *     cookies:
   *       - name: session_id
   *         domain: example.com
   *         path: /
   *         value: abc123xyz
   *         expires: 9999999999
   *         size: 12
   *         httpOnly: false
   *         secure: false
   *         session: false
   * ```
   */
  static async deleteCookies(params: DeleteCookiesParams): Promise<void> {
    const parsed = validations.browser.deleteCookies.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    for (const cookie of parsed.cookies) {
      await browser.deleteCookie(cookie);
    }
  }

  //--------------------------------------------------
  // Interactions
  //--------------------------------------------------

  /**
   * Returns the current viewport dimensions and device settings.
   *
   * @param params - The input parameters.
   * @returns An object with `width`, `height`, `isMobile`, `isLandscape`, and `deviceScaleFactor`.
   * @example
   * ```yaml
   * - group: browser
   *   name: getViewport
   *   params:
   *     browser: '{= browserInstance =}'
   *   destination: viewportInfo
   * ```
   */
  static async getViewport(params: GetViewportParams): Promise<any> {
    const parsed = validations.browser.getViewport.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    return page.viewport();
  }

  /**
   * Resizes the browser viewport to the given dimensions.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: setViewport
   *   params:
   *     browser: '{= browserInstance =}'
   *     width: 1440
   *     height: 900
   * ```
   */
  static async setViewport(params: SetViewportParams): Promise<boolean> {
    const parsed = validations.browser.setViewport.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.setViewport({ width: parsed.width, height: parsed.height });
    return true;
  }

  /**
   * Types a string using the keyboard, optionally targeting a specific element first.
   * Supports a `delay` option to simulate human-speed typing.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Type into a focused search field with a 100ms delay between keystrokes
   * - group: browser
   *   name: keyboardType
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#search-input'
   *     selectorType: css
   *     text: 'browser automation'
   *     options:
   *       delay: 100
   * ```
   */
  static async keyboardType(params: KeyboardTypeParams): Promise<boolean> {
    const parsed = validations.browser.keyboardType.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    if (parsed.selector) {
      const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
      await page.waitForSelector(selector);
      await page.focus(selector);
    }

    await page.keyboard.type(parsed.text, parsed.options || {});
    return true;
  }

  /**
   * Holds a keyboard key down (without releasing it). Pair with `keyboardUp` to release.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Hold Shift down before pressing another key
   * - group: browser
   *   name: keyboardDown
   *   params:
   *     browser: '{= browserInstance =}'
   *     key: Shift
   * ```
   */
  static async keyboardDown(params: KeyboardDownParams): Promise<boolean> {
    const parsed = validations.browser.keyboardDown.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.keyboard.down(parsed.key as KeyInput);
    return true;
  }

  /**
   * Releases a previously held keyboard key.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: keyboardUp
   *   params:
   *     browser: '{= browserInstance =}'
   *     key: Shift
   * ```
   */
  static async keyboardUp(params: KeyboardUpParams): Promise<boolean> {
    const parsed = validations.browser.keyboardUp.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.keyboard.up(parsed.key as KeyInput);
    return true;
  }

  /**
   * Presses and immediately releases a keyboard key.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Press Enter to submit a form
   * - group: browser
   *   name: keyboardPress
   *   params:
   *     browser: '{= browserInstance =}'
   *     key: Enter
   * ```
   */
  static async keyboardPress(params: KeyboardPressParams): Promise<boolean> {
    const parsed = validations.browser.keyboardPress.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.keyboard.press(parsed.key as KeyInput);
    return true;
  }

  /**
   * Dispatches a single character as a key event. Unlike `keyboardType`, this does not
   * send key-down/key-up events — use it for special characters that require it.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: keyboardSendCharacter
   *   params:
   *     browser: '{= browserInstance =}'
   *     char: '@'
   * ```
   */
  static async keyboardSendCharacter(params: KeyboardSendCharacterParams): Promise<boolean> {
    const parsed = validations.browser.keyboardSendCharacter.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.keyboard.sendCharacter(parsed.char);
    return true;
  }

  /**
   * Clicks at an absolute X/Y coordinate on the page.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Double-click at coordinate (640, 360)
   * - group: browser
   *   name: mouseClick
   *   params:
   *     browser: '{= browserInstance =}'
   *     x: 640
   *     y: 360
   *     options:
   *       button: left
   *       count: 2
   *       delay: 50
   * ```
   */
  static async mouseClick(params: MouseClickParams): Promise<boolean> {
    const parsed = validations.browser.mouseClick.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.mouse.click(parsed.x, parsed.y, parsed.options || {});
    return true;
  }

  /**
   * Presses and holds a mouse button at the current cursor position.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: mouseDown
   *   params:
   *     browser: '{= browserInstance =}'
   *     options:
   *       button: left
   * ```
   */
  static async mouseDown(params: MouseDownParams): Promise<boolean> {
    const parsed = validations.browser.mouseDown.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.mouse.down(parsed.options || {});
    return true;
  }

  /**
   * Releases a previously held mouse button.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: mouseUp
   *   params:
   *     browser: '{= browserInstance =}'
   *     options:
   *       button: left
   * ```
   */
  static async mouseUp(params: MouseUpParams): Promise<boolean> {
    const parsed = validations.browser.mouseUp.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.mouse.up(parsed.options || {});
    return true;
  }

  /**
   * Moves the mouse cursor to an absolute X/Y coordinate on the page.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: mouseMove
   *   params:
   *     browser: '{= browserInstance =}'
   *     x: 200
   *     y: 400
   *     options:
   *       steps: 5
   * ```
   */
  static async mouseMove(params: MouseMoveParams): Promise<boolean> {
    const parsed = validations.browser.mouseMove.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.mouse.move(parsed.x, parsed.y, parsed.options || {});
    return true;
  }

  /**
   * Scrolls the page by simulating a mouse wheel event.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Scroll down 500px vertically
   * - group: browser
   *   name: mouseWheel
   *   params:
   *     browser: '{= browserInstance =}'
   *     options:
   *       deltaX: 0
   *       deltaY: 500
   * ```
   */
  static async mouseWheel(params: MouseWheelParams): Promise<boolean> {
    const parsed = validations.browser.mouseWheel.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    await page.mouse.wheel({
      deltaX: parsed.options?.deltaX ?? 0,
      deltaY: parsed.options?.deltaY ?? 0,
    });
    return true;
  }

  /**
   * Drags from one set of page coordinates to another, simulating a slow mouse drag.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: dragAndDropByCoordinates
   *   params:
   *     browser: '{= browserInstance =}'
   *     start:
   *       x: 100
   *       y: 200
   *     target:
   *       x: 400
   *       y: 200
   *     steps: 20
   * ```
   */
  static async dragAndDropByCoordinates(params: DragAndDropByCoordinatesParams): Promise<boolean> {
    const parsed = validations.browser.dragAndDropByCoordinates.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    const { start, target, steps = 10 } = parsed;

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps });
    await page.mouse.up();
    return true;
  }

  /**
   * Drags one DOM element onto another by resolving their bounding boxes first.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: dragAndDropByElements
   *   params:
   *     browser: '{= browserInstance =}'
   *     sourceSelector: '.draggable-card'
   *     targetSelector: '.drop-zone'
   *     selectorType: css
   *     steps: 15
   * ```
   */
  static async dragAndDropByElements(params: DragAndDropByElementsParams): Promise<boolean> {
    const parsed = validations.browser.dragAndDropByElements.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);
    const steps = parsed.steps || 10;

    const sourceSel = GroupBrowser.formatSelector(parsed.sourceSelector, parsed.selectorType);
    const targetSel = GroupBrowser.formatSelector(parsed.targetSelector, parsed.selectorType);

    await page.waitForSelector(sourceSel);
    await page.waitForSelector(targetSel);

    const source = await page.$(sourceSel);
    const target = await page.$(targetSel);

    const sourceBox = await source?.boundingBox();
    const targetBox = await target?.boundingBox();

    if (!sourceBox || !targetBox) throw new Error('Source or target element not found');

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps,
    });
    await page.mouse.up();

    return true;
  }

  //--------------------------------------------------
  // Transfer
  //--------------------------------------------------

  /**
   * Uploads one or more files to a `<input type="file">` element. File paths must be absolute.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: uploadFile
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: '#file-input'
   *     selectorType: css
   *     filePaths:
   *       - /tmp/document.pdf
   *       - /tmp/attachment.zip
   * ```
   */
  static async uploadFile(params: UploadFileParams): Promise<boolean> {
    const parsed = validations.browser.uploadFile.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);
    await page.waitForSelector(selector);

    const elementHandle = await page.$(selector);
    if (!elementHandle) throw new Error('File input not found');

    await (elementHandle as ElementHandle<HTMLInputElement>).uploadFile(...parsed.filePaths);
    return true;
  }

  /**
   * Clicks a download link and waits for the file to finish downloading to `path`.
   * The `path` must be a directory — the browser uses the server-suggested filename.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * - group: browser
   *   name: downloadFile
   *   params:
   *     browser: '{= browserInstance =}'
   *     selector: 'a.download-link'
   *     selectorType: css
   *     path: /tmp/downloads/
   * ```
   */
  static async downloadFile(params: DownloadFileParams): Promise<boolean> {
    const parsed = validations.browser.downloadFile.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const selector = GroupBrowser.formatSelector(parsed.selector, parsed.selectorType);
    const page = await GroupBrowser.getActivePage(browser);

    const downloadPath = parsed.path;

    if (fs.existsSync(downloadPath) && fs.lstatSync(downloadPath).isDirectory()) {
      // path is an existing directory — Puppeteer will use the server-suggested filename
    } else {
      fs.mkdirSync(path.dirname(downloadPath), { recursive: true });
    }

    const client = await page.createCDPSession();
    await client.send('Page.enable');
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
    });

    let downloadFileName = '';

    client.on('Page.downloadWillBegin', ({ suggestedFilename }) => {
      downloadFileName = suggestedFilename;
    });

    await page.click(selector);

    await new Promise<void>((resolve, reject) => {
      const timeout = 480000;
      const interval = 300;
      const start = Date.now();

      const waitForFile = () => {
        if (!downloadFileName) {
          if (Date.now() - start > timeout) return reject(new Error('Download did not start'));
          return setTimeout(waitForFile, interval);
        }

        const targetPath = path.join(downloadPath, downloadFileName);
        const downloadingPath = targetPath + '.crdownload';

        if (fs.existsSync(targetPath) && !fs.existsSync(downloadingPath)) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error('Download timeout'));
        } else {
          setTimeout(waitForFile, interval);
        }
      };

      waitForFile();
    });

    return true;
  }

  //--------------------------------------------------
  // Diagnostics
  //--------------------------------------------------

  /**
   * Runs a Lighthouse audit against a URL, reusing the given browser's debugging session.
   *
   * `categories` selects which Lighthouse category groups to run — `performance`,
   * `accessibility`, `best-practices`, `seo` — each of which bundles many individual audits
   * (e.g. `performance` includes `uses-long-cache-ttl`, `server-response-time`,
   * `render-blocking-resources`). Individual audits cannot be selected on their own; they
   * come along with whichever category they belong to. Omit `categories` to run all of them.
   *
   * Stack packs are not selectable — Lighthouse auto-detects the audited page's tech stack
   * (Drupal, WordPress, Magento, Next.js, etc.) and, when it recognizes one, attaches
   * stack-specific advice per audit id to `stackPacks`. If the URL isn't actually running a
   * recognized stack, `stackPacks` comes back empty regardless of `categories`.
   *
   * @param params - The input parameters.
   * @returns An object with `categories` (scores per category), `audits` (every audit's
   * result, keyed by audit id), and `stackPacks` (auto-detected stack-specific advice, if any).
   * @example
   * ```yaml
   * # Audit only performance and best-practices
   * - group: browser
   *   name: runLighthouseAudit
   *   params:
   *     browser: '{= browserInstance =}'
   *     url: 'https://example.com'
   *     categories:
   *       - performance
   *       - best-practices
   *   destination: audit
   * # audit.categories.performance.score, audit.audits['uses-long-cache-ttl'], ...
   * # audit.stackPacks[0].descriptions['render-blocking-resources'] (e.g. Drupal-specific advice)
   * ```
   */
  static async runLighthouseAudit(params: RunLighthouseAuditParams): Promise<any> {
    const parsed = validations.browser.runLighthouseAudit.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    // Queued behind lighthouseQueue (see its declaration) so a concurrent audit in this
    // process runs after this one finishes, rather than racing it.
    const runAudit = () =>
      lighthouse(
        parsed.url,
        {
          logLevel: 'error',
          onlyCategories: parsed.categories,
        },
        undefined,
        page as any
      );
    const queued = GroupBrowser.lighthouseQueue.then(runAudit, runAudit);
    GroupBrowser.lighthouseQueue = queued.catch(() => undefined);
    const result = await queued;

    if (!result) throw new Error('Lighthouse audit did not produce a report.');

    return {
      categories: result.lhr.categories,
      audits: result.lhr.audits,
      stackPacks: result.lhr.stackPacks,
    };
  }

  /**
   * Begins recording a HAR (HTTP Archive) capture — every request/response on the page,
   * including sub-resources like CSS, JS, images, and CDN-hosted assets, not just the
   * top-level document, with headers, per-resource timing, cache status, and cookies.
   * Response bodies are not captured. Pass the returned id to `stopHarCapture` to build
   * and retrieve the HAR.
   *
   * The live CDP session and its listeners are kept in an in-memory registry, not in the
   * returned value — pipeline variables get streamed over IPC and persisted to disk, both
   * of which require plain, structured-cloneable data, and a raw CDPSession/callback isn't.
   *
   * @param params - The input parameters.
   * @returns A capture id (pass to `stopHarCapture`).
   * @example
   * ```yaml
   * - group: browser
   *   name: startHarCapture
   *   params:
   *     browser: '{= browserInstance =}'
   *   destination: captureId
   * ```
   */
  static async startHarCapture(params: StartHarCaptureParams): Promise<string> {
    const parsed = validations.browser.startHarCapture.runtime.validate(params);
    const browser = parsed.browser as unknown as Browser;
    const page = await GroupBrowser.getActivePage(browser);

    const client = await page.createCDPSession();
    await client.send('Page.enable');
    await client.send('Network.enable');

    const messages: Array<{ method: string; params: any }> = [];
    const handlers = new Map<string, (eventParams: any) => void>();

    for (const method of HAR_CAPTURE_EVENTS) {
      const handler = (eventParams: any) => messages.push({ method, params: eventParams });
      handlers.set(method, handler);
      client.on(method as any, handler);
    }

    const id = `har_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    GroupBrowser.harCaptures.set(id, { client, messages, handlers });
    return id;
  }

  /**
   * Stops a capture started by `startHarCapture`, builds the HAR (HTTP Archive) object from
   * the recorded CDP events via `chrome-har`, and returns it. `log.entries[]` holds one item
   * per request/response — `entries[].response.headers` is where to check cache/CDN headers,
   * `entries[].timings` has the DNS/connect/SSL/wait/receive breakdown per resource.
   *
   * @param params - The input parameters.
   * @returns The HAR object. Also written to `path` if provided.
   * @example
   * ```yaml
   * - group: browser
   *   name: stopHarCapture
   *   params:
   *     browser: '{= browserInstance =}'
   *     capture: '{= captureId =}'
   *     path: /tmp/capture.har
   *   destination: har
   * ```
   */
  static async stopHarCapture(params: StopHarCaptureParams): Promise<any> {
    const parsed = validations.browser.stopHarCapture.runtime.validate(params);
    const handle = GroupBrowser.harCaptures.get(parsed.capture);
    if (!handle) throw new Error(`No active HAR capture with id "${parsed.capture}"`);
    GroupBrowser.harCaptures.delete(parsed.capture);

    const { client, messages, handlers } = handle;
    for (const [method, handler] of handlers) client.off(method as any, handler);
    await client.send('Network.disable');
    await client.send('Page.disable');

    const har = harFromMessages(messages, { includeTextFromResponseBody: false });

    if (parsed.path) {
      fs.mkdirSync(path.dirname(parsed.path), { recursive: true });
      fs.writeFileSync(parsed.path, JSON.stringify(har, null, 2));
    }

    return har;
  }
}
