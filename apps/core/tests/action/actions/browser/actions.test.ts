import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import puppeteer from 'puppeteer-extra';
import * as ChromeLauncher from 'chrome-launcher';
import { KnownDevices } from 'puppeteer-core';
import { harFromMessages } from 'chrome-har';
import { GroupBrowser } from '@/action/actions/browser/actions';

// GroupBrowser drives a real Chrome process via puppeteer-extra + chrome-launcher.
// We mock both entry points so no Chrome process is ever spawned, and we mock the
// Browser/Page/ElementHandle objects returned by those calls so every downstream
// puppeteer-core call (page.goto, page.click, page.$eval, ...) is fully controlled.

vi.mock('puppeteer-extra', () => ({
  default: {
    use: vi.fn(),
    launch: vi.fn(),
  },
}));

vi.mock('puppeteer-extra-plugin-stealth', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('chrome-launcher', () => ({
  Launcher: {
    getInstallations: vi.fn(),
  },
}));

// chrome-har's own HAR-building correctness isn't our code to test — we mock it so
// startHarCapture/stopHarCapture tests focus on what we're responsible for: CDP wiring,
// the capture registry lifecycle, and returning a structured-cloneable result.
vi.mock('chrome-har', () => ({
  harFromMessages: vi.fn(),
}));

// ----------------------------------------------------------------------------
// Mock fixtures
// ----------------------------------------------------------------------------

function createMockElementHandle(attributeValues: Record<string, string | boolean> = {}) {
  return {
    evaluate: vi.fn((_fn: any, attr: string) => Promise.resolve(attributeValues[attr] ?? '')),
    screenshot: vi.fn().mockResolvedValue(undefined),
    boundingBox: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 100, height: 50 }),
    uploadFile: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
  };
}

function createMockLocator() {
  return {
    hover: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockResponse(overrides: Record<string, any> = {}) {
  return {
    status: () => overrides.status ?? 200,
    statusText: () => overrides.statusText ?? 'OK',
    ok: () => overrides.ok ?? true,
    url: () => overrides.url ?? 'https://example.com/',
    headers: () => overrides.headers ?? { 'content-type': 'text/html' },
    remoteAddress: () => overrides.remoteAddress ?? { ip: '127.0.0.1', port: 443 },
    fromCache: () => overrides.fromCache ?? false,
    fromServiceWorker: () => overrides.fromServiceWorker ?? false,
    timing: () => overrides.timing ?? null,
  };
}

function createMockPage() {
  return {
    // Navigation
    goto: vi.fn().mockResolvedValue(createMockResponse()),
    reload: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(undefined),
    goForward: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://example.com/'),
    title: vi.fn().mockResolvedValue('Example Domain'),
    setContent: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue('<html></html>'),
    waitForNavigation: vi.fn().mockResolvedValue(undefined),
    waitForNetworkIdle: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(createMockElementHandle()),

    // Emulation / device
    emulate: vi.fn().mockResolvedValue(undefined),
    setGeolocation: vi.fn().mockResolvedValue(undefined),
    emulateTimezone: vi.fn().mockResolvedValue(undefined),
    isJavaScriptEnabled: vi.fn().mockReturnValue(true),
    setUserAgent: vi.fn().mockResolvedValue(undefined),

    // Evaluation
    evaluate: vi.fn().mockResolvedValue(undefined),

    // Elements
    locator: vi.fn(() => createMockLocator()),
    focus: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(createMockElementHandle()),
    $$: vi.fn().mockResolvedValue([]),
    $eval: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),

    // Content
    screenshot: vi.fn().mockResolvedValue(undefined),
    screencast: vi.fn().mockResolvedValue({ stop: vi.fn().mockResolvedValue(undefined) }),
    pdf: vi.fn().mockResolvedValue(undefined),
    addStyleTag: vi.fn().mockResolvedValue(undefined),

    // Viewport
    viewport: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
    setViewport: vi.fn().mockResolvedValue(undefined),

    // Keyboard / mouse
    keyboard: {
      type: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
      sendCharacter: vi.fn().mockResolvedValue(undefined),
    },
    mouse: {
      click: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
    },

    // CDP / downloads
    createCDPSession: vi.fn(),
  };
}

function createMockBrowser(page = createMockPage()) {
  return {
    // Required by isBrowserInstance() so the runtime Zod schema accepts this fixture.
    close: vi.fn().mockResolvedValue(undefined),
    newPage: vi.fn().mockResolvedValue(page),
    pages: vi.fn().mockResolvedValue([page]),
    version: vi.fn().mockResolvedValue('HeadlessChrome/120.0.0.0'),

    cookies: vi.fn().mockResolvedValue([]),
    setCookie: vi.fn().mockResolvedValue(undefined),
    deleteCookie: vi.fn().mockResolvedValue(undefined),
  };
}

describe('GroupBrowser', () => {
  let page: ReturnType<typeof createMockPage>;
  let browser: ReturnType<typeof createMockBrowser>;

  beforeEach(() => {
    page = createMockPage();
    browser = createMockBrowser(page);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // Browser Control
  // ==========================================================================
  describe('launch', () => {
    beforeEach(() => {
      (ChromeLauncher.Launcher.getInstallations as ReturnType<typeof vi.fn>).mockReturnValue([
        '/usr/bin/google-chrome',
      ]);
      (puppeteer.launch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(browser);
    });

    it('launches with a discovered Chrome path and default viewport/headless settings', async () => {
      const result = await GroupBrowser.launch({});

      expect(puppeteer.launch).toHaveBeenCalledWith({
        executablePath: '/usr/bin/google-chrome',
        headless: true,
        timeout: 30000,
        defaultViewport: { width: 1280, height: 720, isMobile: false, isLandscape: false },
      });
      expect(result).toBe(browser);
    });

    it('uses an explicit chromePath instead of discovery when provided', async () => {
      await GroupBrowser.launch({ chromePath: '/custom/chrome' });

      expect(ChromeLauncher.Launcher.getInstallations).not.toHaveBeenCalled();
      expect(puppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({ executablePath: '/custom/chrome' })
      );
    });

    it('honors custom headless mode, timeout, and viewport (edge case)', async () => {
      await GroupBrowser.launch({
        headless: 'shell',
        timeout: 5000,
        viewport: { width: 375, height: 667, isMobile: true, isLandscape: false },
      });

      expect(puppeteer.launch).toHaveBeenCalledWith({
        executablePath: '/usr/bin/google-chrome',
        headless: 'shell',
        timeout: 5000,
        defaultViewport: { width: 375, height: 667, isMobile: true, isLandscape: false },
      });
    });

    it('throws when no Chrome installation is found and no chromePath is given', async () => {
      (ChromeLauncher.Launcher.getInstallations as ReturnType<typeof vi.fn>).mockReturnValue([]);
      await expect(GroupBrowser.launch({})).rejects.toThrow('Chrome not found');
      expect(puppeteer.launch).not.toHaveBeenCalled();
    });

    it('propagates a rejection from puppeteer.launch', async () => {
      (puppeteer.launch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Failed to launch the browser process')
      );
      await expect(GroupBrowser.launch({})).rejects.toThrow('Failed to launch the browser process');
    });

    it('rejects with a validation error when headless has an invalid value', async () => {
      await expect(GroupBrowser.launch({ headless: 'yes' as any })).rejects.toThrow();
    });
  });

  describe('close', () => {
    it('closes the given browser instance', async () => {
      await GroupBrowser.close({ browser: browser as any });
      expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it('rejects with a validation error when browser is not a valid Browser instance', async () => {
      await expect(GroupBrowser.close({ browser: {} as any })).rejects.toThrow();
    });

    it('propagates a rejection when close() fails', async () => {
      browser.close.mockRejectedValueOnce(new Error('close failed'));
      await expect(GroupBrowser.close({ browser: browser as any })).rejects.toThrow('close failed');
    });
  });

  describe('emulateDevice', () => {
    it('emulates a known device profile on the active page', async () => {
      await GroupBrowser.emulateDevice({ browser: browser as any, device: 'iPhone 15' });
      expect(page.emulate).toHaveBeenCalledWith(KnownDevices['iPhone 15']);
    });

    it('calls page.emulate with undefined for an unrecognized device name (observed behavior — see report)', async () => {
      await GroupBrowser.emulateDevice({ browser: browser as any, device: 'Not A Real Device' });
      expect(page.emulate).toHaveBeenCalledWith(undefined);
    });

    it('throws when the browser has no open pages', async () => {
      browser.pages.mockResolvedValueOnce([]);
      await expect(
        GroupBrowser.emulateDevice({ browser: browser as any, device: 'iPhone 15' })
      ).rejects.toThrow('No open pages found in the browser instance');
    });
  });

  describe('setGeolocation', () => {
    it('sets geolocation coordinates on the active page', async () => {
      const coordinates = { latitude: 37.7749, longitude: -122.4194, accuracy: 50 };
      await GroupBrowser.setGeolocation({ browser: browser as any, coordinates });
      expect(page.setGeolocation).toHaveBeenCalledWith(coordinates);
    });

    it('rejects with a validation error when latitude is out of range', async () => {
      await expect(
        GroupBrowser.setGeolocation({
          browser: browser as any,
          coordinates: { latitude: 999, longitude: 0 },
        } as any)
      ).rejects.toThrow();
    });

    it('propagates a rejection from page.setGeolocation', async () => {
      page.setGeolocation.mockRejectedValueOnce(new Error('geolocation denied'));
      await expect(
        GroupBrowser.setGeolocation({
          browser: browser as any,
          coordinates: { latitude: 0, longitude: 0 },
        })
      ).rejects.toThrow('geolocation denied');
    });
  });

  describe('emulateTimezone', () => {
    it('overrides the timezone on the active page', async () => {
      await GroupBrowser.emulateTimezone({ browser: browser as any, timezoneId: 'America/New_York' });
      expect(page.emulateTimezone).toHaveBeenCalledWith('America/New_York');
    });

    it('rejects with a validation error when timezoneId is missing', async () => {
      await expect(GroupBrowser.emulateTimezone({ browser: browser as any } as any)).rejects.toThrow();
    });
  });

  describe('isJavaScriptEnabled', () => {
    it('returns the page JavaScript-enabled state', async () => {
      page.isJavaScriptEnabled.mockReturnValue(false);
      const result = await GroupBrowser.isJavaScriptEnabled({ browser: browser as any });
      expect(result).toBe(false);
    });
  });

  describe('setUserAgent', () => {
    it('sets a custom user agent on the active page', async () => {
      await GroupBrowser.setUserAgent({ browser: browser as any, userAgent: 'Tipeline/1.0' });
      expect(page.setUserAgent).toHaveBeenCalledWith('Tipeline/1.0');
    });

    it('rejects with a validation error when userAgent is missing', async () => {
      await expect(GroupBrowser.setUserAgent({ browser: browser as any } as any)).rejects.toThrow();
    });
  });

  describe('getUserAgent', () => {
    it('reads navigator.userAgent from the page', async () => {
      page.evaluate.mockResolvedValueOnce('Mozilla/5.0 (Test)');
      const result = await GroupBrowser.getUserAgent({ browser: browser as any });
      expect(page.evaluate).toHaveBeenCalledWith('navigator.userAgent');
      expect(result).toBe('Mozilla/5.0 (Test)');
    });
  });

  // ==========================================================================
  // Page Navigation
  // ==========================================================================
  describe('goTo', () => {
    it('navigates to a URL and returns the full response details', async () => {
      page.goto.mockResolvedValueOnce(
        createMockResponse({ status: 204, headers: { 'x-drupal-cache': 'HIT' } })
      );
      const result = await GroupBrowser.goTo({ browser: browser as any, url: 'https://example.com' });

      expect(page.goto).toHaveBeenCalledWith('https://example.com', {});
      expect(result.status).toBe(204);
      expect(result.headers).toEqual({ 'x-drupal-cache': 'HIT' });
      expect(result.ok).toBe(true);
      expect(result.fromCache).toBe(false);
    });

    it('forwards waitUntil and timeout as navigation options (edge case)', async () => {
      await GroupBrowser.goTo({
        browser: browser as any,
        url: 'https://example.com',
        waitUntil: 'networkidle0',
        timeout: 15000,
      });
      expect(page.goto).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'networkidle0',
        timeout: 15000,
      });
    });

    it('returns a null-filled result instead of throwing when goto resolves to null (edge case)', async () => {
      page.goto.mockResolvedValueOnce(null);
      page.url.mockReturnValueOnce('https://example.com/after-redirect');

      const result = await GroupBrowser.goTo({ browser: browser as any, url: 'https://example.com' });

      expect(result.status).toBeNull();
      expect(result.headers).toBeNull();
      expect(result.url).toBe('https://example.com/after-redirect');
    });

    it('throws a validation error when url is missing', async () => {
      await expect(GroupBrowser.goTo({ browser: browser as any } as any)).rejects.toThrow();
    });

    it('propagates a rejection when navigation fails', async () => {
      page.goto.mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'));
      await expect(
        GroupBrowser.goTo({ browser: browser as any, url: 'https://bad.invalid' })
      ).rejects.toThrow('net::ERR_NAME_NOT_RESOLVED');
    });
  });

  describe('reload', () => {
    it('reloads the active page', async () => {
      await GroupBrowser.reload({ browser: browser as any });
      expect(page.reload).toHaveBeenCalledTimes(1);
      expect(page.reload).toHaveBeenCalledWith({});
    });

    it('forwards waitUntil and timeout as navigation options (edge case)', async () => {
      await GroupBrowser.reload({
        browser: browser as any,
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      expect(page.reload).toHaveBeenCalledWith({ waitUntil: 'networkidle2', timeout: 30000 });
    });
  });

  describe('goBackPage', () => {
    it('navigates back with domcontentloaded wait', async () => {
      await GroupBrowser.goBackPage({ browser: browser as any });
      expect(page.goBack).toHaveBeenCalledWith({ waitUntil: 'domcontentloaded' });
    });
  });

  describe('goForwardPage', () => {
    it('navigates forward with domcontentloaded wait', async () => {
      await GroupBrowser.goForwardPage({ browser: browser as any });
      expect(page.goForward).toHaveBeenCalledWith({ waitUntil: 'domcontentloaded' });
    });
  });

  describe('getUrl', () => {
    it('returns the current page URL', async () => {
      const result = await GroupBrowser.getUrl({ browser: browser as any });
      expect(result).toBe('https://example.com/');
    });
  });

  describe('getPageTitle', () => {
    it('returns the current page title', async () => {
      const result = await GroupBrowser.getPageTitle({ browser: browser as any });
      expect(result).toBe('Example Domain');
    });
  });

  describe('setContent', () => {
    it('replaces the page content and waits for domcontentloaded', async () => {
      await GroupBrowser.setContent({ browser: browser as any, content: '<h1>Hi</h1>' });
      expect(page.setContent).toHaveBeenCalledWith('<h1>Hi</h1>', { waitUntil: 'domcontentloaded' });
    });

    it('rejects with a validation error when content is missing', async () => {
      await expect(GroupBrowser.setContent({ browser: browser as any } as any)).rejects.toThrow();
    });
  });

  describe('source', () => {
    it('returns the full page HTML', async () => {
      page.content.mockResolvedValueOnce('<html><body>hi</body></html>');
      const result = await GroupBrowser.source({ browser: browser as any });
      expect(result).toBe('<html><body>hi</body></html>');
    });
  });

  // ==========================================================================
  // Element Actions
  // ==========================================================================
  describe('hoverElement', () => {
    it('hovers over an element located by CSS selector', async () => {
      const result = await GroupBrowser.hoverElement({
        browser: browser as any,
        selector: '.dropdown',
        selectorType: 'css',
      });
      expect(page.locator).toHaveBeenCalledWith('.dropdown');
      expect(result).toBe(true);
    });

    it('formats an xpath selector before locating (edge case)', async () => {
      await GroupBrowser.hoverElement({
        browser: browser as any,
        selector: '//div',
        selectorType: 'xpath',
      });
      expect(page.locator).toHaveBeenCalledWith('::-p-xpath(//div)');
    });

    it('throws a validation error when selector is missing', async () => {
      await expect(GroupBrowser.hoverElement({ browser: browser as any } as any)).rejects.toThrow();
    });

    it('propagates a rejection when hover() fails', async () => {
      const locator = createMockLocator();
      locator.hover.mockRejectedValueOnce(new Error('element detached'));
      page.locator.mockReturnValueOnce(locator);

      await expect(
        GroupBrowser.hoverElement({ browser: browser as any, selector: '.gone' })
      ).rejects.toThrow('element detached');
    });
  });

  describe('clickElement', () => {
    it('clicks an element with no wait condition', async () => {
      const result = await GroupBrowser.clickElement({ browser: browser as any, selector: '#btn' });
      expect(page.locator).toHaveBeenCalledWith('#btn');
      expect(result).toBe(true);
    });

    it('waits for the selector (timeout) before clicking', async () => {
      await GroupBrowser.clickElement({
        browser: browser as any,
        selector: '#btn',
        waitFor: { type: 'timeout', timeout: 2000 },
      });
      expect(page.waitForSelector).toHaveBeenCalledWith('#btn', { timeout: 2000 });
    });

    it('waits for a different selector to appear alongside the click', async () => {
      await GroupBrowser.clickElement({
        browser: browser as any,
        selector: '#btn',
        waitFor: { type: 'selector', selector: '#result', selectorType: 'css' },
      });
      expect(page.waitForSelector).toHaveBeenCalledWith('#result');
    });

    it('throws when waitFor.type is "selector" but no selector is given', async () => {
      await expect(
        GroupBrowser.clickElement({
          browser: browser as any,
          selector: '#btn',
          waitFor: { type: 'selector' },
        } as any)
      ).rejects.toThrow("Selector is required for type 'selector'");
    });

    it('waits for navigation after clicking', async () => {
      await GroupBrowser.clickElement({
        browser: browser as any,
        selector: '#submit',
        waitFor: { type: 'navigation' },
      });
      expect(page.waitForNavigation).toHaveBeenCalledWith({ waitUntil: 'load' });
    });

    it('waits for network idle after clicking', async () => {
      await GroupBrowser.clickElement({
        browser: browser as any,
        selector: '#submit',
        waitFor: { type: 'networkidle' },
      });
      expect(page.waitForNetworkIdle).toHaveBeenCalledTimes(1);
    });

    it('propagates a rejection when the click fails', async () => {
      const locator = createMockLocator();
      locator.click.mockRejectedValueOnce(new Error('Node is not clickable'));
      page.locator.mockReturnValueOnce(locator);

      await expect(
        GroupBrowser.clickElement({ browser: browser as any, selector: '#btn' })
      ).rejects.toThrow('Node is not clickable');
    });
  });

  describe('focusElement', () => {
    it('waits for and focuses an element', async () => {
      const result = await GroupBrowser.focusElement({ browser: browser as any, selector: '#input' });
      expect(page.waitForSelector).toHaveBeenCalledWith('#input');
      expect(page.focus).toHaveBeenCalledWith('#input');
      expect(result).toBe(true);
    });

    it('propagates a rejection when the selector never appears', async () => {
      page.waitForSelector.mockRejectedValueOnce(new Error('waiting for selector failed: timeout'));
      await expect(
        GroupBrowser.focusElement({ browser: browser as any, selector: '#ghost' })
      ).rejects.toThrow('waiting for selector failed');
    });
  });

  describe('typeInElement', () => {
    it('types text into an element after waiting for it', async () => {
      const result = await GroupBrowser.typeInElement({
        browser: browser as any,
        selector: '#search',
        text: 'browser automation',
      });
      expect(page.type).toHaveBeenCalledWith('#search', 'browser automation');
      expect(result).toBe(true);
    });

    it('rejects with a validation error when text is missing', async () => {
      await expect(
        GroupBrowser.typeInElement({ browser: browser as any, selector: '#search' } as any)
      ).rejects.toThrow();
    });
  });

  describe('getElement', () => {
    it('reads the requested attribute from a matched element', async () => {
      page.$.mockResolvedValueOnce(createMockElementHandle({ text: 'Hello' }));
      const result = await GroupBrowser.getElement({
        browser: browser as any,
        selector: '#heading',
        attribute: 'text',
      });
      expect(result).toBe('Hello');
    });

    it('returns "" when the element does not exist and attribute is not "exists" (edge case)', async () => {
      page.$.mockResolvedValueOnce(null);
      const result = await GroupBrowser.getElement({
        browser: browser as any,
        selector: '#missing',
        attribute: 'text',
      });
      expect(result).toBe('');
    });

    it('returns false when the element does not exist and attribute is "exists" (edge case)', async () => {
      page.$.mockResolvedValueOnce(null);
      const result = await GroupBrowser.getElement({
        browser: browser as any,
        selector: '#missing',
        attribute: 'exists',
      });
      expect(result).toBe(false);
    });

    it('honors a waitFor condition before reading', async () => {
      await GroupBrowser.getElement({
        browser: browser as any,
        selector: '#heading',
        attribute: 'text',
        waitFor: { type: 'navigation' },
      });
      expect(page.waitForNavigation).toHaveBeenCalledWith({ waitUntil: 'load' });
    });

    it('rejects with a validation error for a disallowed attribute', async () => {
      await expect(
        GroupBrowser.getElement({
          browser: browser as any,
          selector: '#heading',
          attribute: 'not-a-real-attribute',
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('getElements', () => {
    it('collects the requested attribute from every matching element', async () => {
      page.$$.mockResolvedValueOnce([
        createMockElementHandle({ text: 'One' }),
        createMockElementHandle({ text: 'Two' }),
      ]);
      const result = await GroupBrowser.getElements({
        browser: browser as any,
        selector: 'li a',
        attribute: 'text',
      });
      expect(result).toEqual(['One', 'Two']);
    });

    it('skips empty string values (edge case)', async () => {
      page.$$.mockResolvedValueOnce([
        createMockElementHandle({ text: '' }),
        createMockElementHandle({ text: 'Two' }),
      ]);
      const result = await GroupBrowser.getElements({
        browser: browser as any,
        selector: 'li a',
        attribute: 'text',
      });
      expect(result).toEqual(['Two']);
    });

    it('rejects with a validation error when selector is empty', async () => {
      await expect(
        GroupBrowser.getElements({ browser: browser as any, selector: '' } as any)
      ).rejects.toThrow();
    });
  });

  describe('extractStructuredData', () => {
    it('scrapes each row into an array of field values', async () => {
      const rowA = createMockElementHandle();
      rowA.$ = vi.fn().mockImplementation((sel: string) =>
        Promise.resolve(
          sel === 'td.name'
            ? createMockElementHandle({ text: 'Widget' })
            : createMockElementHandle({ href: '/widget' })
        )
      );
      page.$$.mockResolvedValueOnce([rowA]);

      const result = await GroupBrowser.extractStructuredData({
        browser: browser as any,
        itemSelector: 'table.products tr',
        fieldSelectors: [
          { selector: 'td.name', attribute: 'text' },
          { selector: 'td a', attribute: 'href' },
        ],
      });

      expect(result).toEqual([['Widget', '/widget']]);
    });

    it('returns an empty array when there are no matching rows (edge case)', async () => {
      page.$$.mockResolvedValueOnce([]);
      const result = await GroupBrowser.extractStructuredData({
        browser: browser as any,
        itemSelector: 'table.products tr',
        fieldSelectors: [{ selector: 'td.name', attribute: 'text' }],
      });
      expect(result).toEqual([]);
    });

    it('rejects with a validation error when fieldSelectors is missing', async () => {
      await expect(
        GroupBrowser.extractStructuredData({
          browser: browser as any,
          itemSelector: 'tr',
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('setCheckState', () => {
    it('sets the checkbox to the requested checked state', async () => {
      const result = await GroupBrowser.setCheckState({
        browser: browser as any,
        selector: '#agree',
        checked: true,
      });
      expect(page.$eval).toHaveBeenCalledWith('#agree', expect.any(Function), true);
      expect(result).toBe(true);
    });

    it('rejects with a validation error when checked is missing', async () => {
      await expect(
        GroupBrowser.setCheckState({ browser: browser as any, selector: '#agree' } as any)
      ).rejects.toThrow();
    });
  });

  describe('getCheckState', () => {
    it('returns the checkbox checked state', async () => {
      page.$eval.mockResolvedValueOnce(true);
      const result = await GroupBrowser.getCheckState({ browser: browser as any, selector: '#agree' });
      expect(result).toBe(true);
    });
  });

  describe('setSelectState', () => {
    it('selects a single value', async () => {
      await GroupBrowser.setSelectState({ browser: browser as any, selector: '#country', value: 'US' });
      expect(page.select).toHaveBeenCalledWith('#country', 'US');
    });

    it('selects multiple values (edge case)', async () => {
      await GroupBrowser.setSelectState({
        browser: browser as any,
        selector: '#tags',
        value: ['a', 'b'],
      });
      expect(page.select).toHaveBeenCalledWith('#tags', 'a', 'b');
    });
  });

  describe('getSelectState', () => {
    it('returns the selected option values', async () => {
      page.$eval.mockResolvedValueOnce(['US']);
      const result = await GroupBrowser.getSelectState({ browser: browser as any, selector: '#country' });
      expect(result).toEqual(['US']);
    });
  });

  describe('contains', () => {
    it('returns true for contain-element when a match exists', async () => {
      page.$.mockResolvedValueOnce(createMockElementHandle());
      const result = await GroupBrowser.contains({
        browser: browser as any,
        mode: 'contain-element',
        value: '.banner',
      });
      expect(result).toBe(true);
    });

    it('returns true for not-contain-element when no match exists', async () => {
      page.$.mockResolvedValueOnce(null);
      const result = await GroupBrowser.contains({
        browser: browser as any,
        mode: 'not-contain-element',
        value: '.banner',
      });
      expect(result).toBe(true);
    });

    it('returns true for contain-text when the page HTML includes the text', async () => {
      page.content.mockResolvedValueOnce('<p>Welcome back</p>');
      const result = await GroupBrowser.contains({
        browser: browser as any,
        mode: 'contain-text',
        value: 'Welcome back',
      });
      expect(result).toBe(true);
    });

    it('returns true for not-contain-text when the page HTML excludes the text (edge case)', async () => {
      page.content.mockResolvedValueOnce('<p>Goodbye</p>');
      const result = await GroupBrowser.contains({
        browser: browser as any,
        mode: 'not-contain-text',
        value: 'Welcome back',
      });
      expect(result).toBe(true);
    });

    it('rejects with a validation error for an unsupported mode', async () => {
      await expect(
        GroupBrowser.contains({ browser: browser as any, mode: 'bogus', value: 'x' } as any)
      ).rejects.toThrow();
    });
  });

  describe('runJavaScript', () => {
    it('evaluates the script in the page context and returns its result', async () => {
      page.evaluate.mockResolvedValueOnce('Hello, Tipeline!');
      const result = await GroupBrowser.runJavaScript({
        browser: browser as any,
        script: "return greeting + ', ' + name + '!';",
        context: { greeting: 'Hello', name: 'Tipeline' },
      });

      expect(page.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.stringContaining('const { greeting, name } = context;'),
        { greeting: 'Hello', name: 'Tipeline' }
      );
      expect(result).toBe('Hello, Tipeline!');
    });

    it('propagates a rejection thrown by the evaluated script', async () => {
      page.evaluate.mockRejectedValueOnce(new Error('ReferenceError: foo is not defined'));
      await expect(
        GroupBrowser.runJavaScript({ browser: browser as any, script: 'return foo;' })
      ).rejects.toThrow('ReferenceError');
    });
  });

  // ==========================================================================
  // Page Content
  // ==========================================================================
  describe('takeScreenshot', () => {
    it('takes a screenshot with the given options', async () => {
      const options = { path: '/tmp/shot.jpg', fullPage: true, type: 'jpeg' as const };
      const result = await GroupBrowser.takeScreenshot({ browser: browser as any, options });
      expect(page.screenshot).toHaveBeenCalledWith(options);
      expect(result).toBe(true);
    });

    it('propagates a rejection when the screenshot fails', async () => {
      page.screenshot.mockRejectedValueOnce(new Error('Protocol error'));
      await expect(
        GroupBrowser.takeScreenshot({
          browser: browser as any,
          options: { path: '/tmp/shot.jpg', fullPage: false, type: 'png' },
        })
      ).rejects.toThrow('Protocol error');
    });
  });

  describe('takeScreenshotElement', () => {
    it('screenshots a single located element', async () => {
      const handle = createMockElementHandle();
      page.waitForSelector.mockResolvedValueOnce(handle);
      const options = { path: '/tmp/el.jpg', type: 'jpeg' as const };

      const result = await GroupBrowser.takeScreenshotElement({
        browser: browser as any,
        selector: '.hero',
        options,
      });

      expect(handle.screenshot).toHaveBeenCalledWith(options);
      expect(result).toBe(true);
    });

    it('throws when the element is not found', async () => {
      page.waitForSelector.mockResolvedValueOnce(null);
      await expect(
        GroupBrowser.takeScreenshotElement({
          browser: browser as any,
          selector: '.missing',
          options: { path: '/tmp/el.jpg', type: 'png' },
        })
      ).rejects.toThrow('Element not found: .missing');
    });
  });

  describe('startScreencast / stopScreencast', () => {
    it('starts a screencast recording and returns the recorder handle', async () => {
      const recorder = { stop: vi.fn().mockResolvedValue(undefined) };
      page.screencast.mockResolvedValueOnce(recorder);

      const result = await GroupBrowser.startScreencast({
        browser: browser as any,
        options: { path: '/tmp/rec.mp4' },
      });

      expect(page.screencast).toHaveBeenCalledWith({ path: '/tmp/rec.mp4' });
      expect(result).toBe(recorder);
    });

    it('stops the recorder', async () => {
      const recorder = { stop: vi.fn().mockResolvedValue(undefined) };
      const result = await GroupBrowser.stopScreencast({ browser: browser as any, recorder: recorder as any });
      expect(recorder.stop).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('propagates a rejection when stop() fails', async () => {
      const recorder = { stop: vi.fn().mockRejectedValue(new Error('recorder already stopped')) };
      await expect(
        GroupBrowser.stopScreencast({ browser: browser as any, recorder: recorder as any })
      ).rejects.toThrow('recorder already stopped');
    });
  });

  describe('generatePDF', () => {
    it('exports the page to a PDF with the given options', async () => {
      const options = { path: '/tmp/page.pdf', format: 'A4', printBackground: true };
      const result = await GroupBrowser.generatePDF({ browser: browser as any, options });
      expect(page.pdf).toHaveBeenCalledWith(options);
      expect(result).toBe(true);
    });
  });

  describe('wait', () => {
    it('waits a fixed timeout in milliseconds', async () => {
      vi.useFakeTimers();
      const promise = GroupBrowser.wait({ browser: browser as any, type: 'timeout', timeout: 50 });
      await vi.advanceTimersByTimeAsync(50);
      await expect(promise).resolves.toBe(true);
    });

    it('waits for a selector to appear', async () => {
      await GroupBrowser.wait({
        browser: browser as any,
        type: 'selector',
        selector: '#results',
      });
      expect(page.waitForSelector).toHaveBeenCalledWith('#results');
    });

    it('throws when type is "selector" but no selector is given', async () => {
      await expect(
        GroupBrowser.wait({ browser: browser as any, type: 'selector' } as any)
      ).rejects.toThrow("Selector is required for type 'selector'");
    });

    it('waits for navigation', async () => {
      await GroupBrowser.wait({ browser: browser as any, type: 'navigation' });
      expect(page.waitForNavigation).toHaveBeenCalledWith({ waitUntil: 'load' });
    });

    it('waits for network idle', async () => {
      await GroupBrowser.wait({ browser: browser as any, type: 'networkidle' });
      expect(page.waitForNetworkIdle).toHaveBeenCalledTimes(1);
    });
  });

  describe('metadata', () => {
    it('reads the content of matching meta tags', async () => {
      page.evaluate.mockResolvedValueOnce(['A page about testing']);
      const result = await GroupBrowser.metadata({ browser: browser as any, name: 'description' });
      expect(page.evaluate).toHaveBeenCalledWith(expect.any(Function), 'description');
      expect(result).toEqual(['A page about testing']);
    });

    it('rejects with a validation error when name is empty', async () => {
      await expect(GroupBrowser.metadata({ browser: browser as any, name: '' } as any)).rejects.toThrow();
    });
  });

  describe('addStyleTag', () => {
    it('injects the given CSS into the page', async () => {
      const result = await GroupBrowser.addStyleTag({
        browser: browser as any,
        css: 'a { color: red; }',
      });
      expect(page.addStyleTag).toHaveBeenCalledWith({ content: 'a { color: red; }' });
      expect(result).toBe(true);
    });
  });

  describe('getCookies', () => {
    it('returns all cookies from the browser', async () => {
      browser.cookies.mockResolvedValueOnce([{ name: 'session', value: 'abc' }]);
      const result = await GroupBrowser.getCookies({ browser: browser as any });
      expect(result).toEqual([{ name: 'session', value: 'abc' }]);
    });
  });

  describe('setCookies', () => {
    it('sets the given cookies on the browser', async () => {
      const cookies = [{ name: 'session', value: 'abc', domain: 'example.com' }];
      await GroupBrowser.setCookies({ browser: browser as any, cookies });
      expect(browser.setCookie).toHaveBeenCalledWith(...cookies);
    });
  });

  describe('deleteCookies', () => {
    const cookie = {
      name: 'session',
      domain: 'example.com',
      path: '/',
      value: 'abc',
      expires: 9999999999,
      size: 12,
      httpOnly: false,
      secure: false,
      session: false,
    };

    it('deletes each given cookie', async () => {
      await GroupBrowser.deleteCookies({ browser: browser as any, cookies: [cookie] });
      expect(browser.deleteCookie).toHaveBeenCalledWith(cookie);
    });

    it('propagates a rejection when deleteCookie fails', async () => {
      browser.deleteCookie.mockRejectedValueOnce(new Error('cookie not found'));
      await expect(
        GroupBrowser.deleteCookies({ browser: browser as any, cookies: [cookie] })
      ).rejects.toThrow('cookie not found');
    });
  });

  // ==========================================================================
  // Interactions
  // ==========================================================================
  describe('getViewport', () => {
    it('returns the current viewport', async () => {
      const result = await GroupBrowser.getViewport({ browser: browser as any });
      expect(result).toEqual({ width: 1280, height: 720 });
    });
  });

  describe('setViewport', () => {
    it('resizes the viewport', async () => {
      const result = await GroupBrowser.setViewport({ browser: browser as any, width: 1440, height: 900 });
      expect(page.setViewport).toHaveBeenCalledWith({ width: 1440, height: 900 });
      expect(result).toBe(true);
    });

    it('rejects with a validation error for a negative width', async () => {
      await expect(
        GroupBrowser.setViewport({ browser: browser as any, width: -1, height: 900 } as any)
      ).rejects.toThrow();
    });
  });

  describe('keyboardType', () => {
    it('focuses the optional selector before typing', async () => {
      await GroupBrowser.keyboardType({
        browser: browser as any,
        selector: '#search',
        text: 'hello',
        options: { delay: 100 },
      });
      expect(page.focus).toHaveBeenCalledWith('#search');
      expect(page.keyboard.type).toHaveBeenCalledWith('hello', { delay: 100 });
    });

    it('types without focusing when no selector is given (edge case)', async () => {
      await GroupBrowser.keyboardType({ browser: browser as any, text: 'hello' });
      expect(page.focus).not.toHaveBeenCalled();
      expect(page.keyboard.type).toHaveBeenCalledWith('hello', {});
    });
  });

  describe('keyboardDown / keyboardUp / keyboardPress / keyboardSendCharacter', () => {
    it('holds a key down', async () => {
      await GroupBrowser.keyboardDown({ browser: browser as any, key: 'Shift' });
      expect(page.keyboard.down).toHaveBeenCalledWith('Shift');
    });

    it('releases a key', async () => {
      await GroupBrowser.keyboardUp({ browser: browser as any, key: 'Shift' });
      expect(page.keyboard.up).toHaveBeenCalledWith('Shift');
    });

    it('presses a key', async () => {
      await GroupBrowser.keyboardPress({ browser: browser as any, key: 'Enter' });
      expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
    });

    it('sends a raw character', async () => {
      await GroupBrowser.keyboardSendCharacter({ browser: browser as any, char: '@' });
      expect(page.keyboard.sendCharacter).toHaveBeenCalledWith('@');
    });

    it('propagates a rejection from keyboard.press', async () => {
      page.keyboard.press.mockRejectedValueOnce(new Error('key press failed'));
      await expect(
        GroupBrowser.keyboardPress({ browser: browser as any, key: 'Enter' })
      ).rejects.toThrow('key press failed');
    });
  });

  describe('mouseClick / mouseDown / mouseUp / mouseMove / mouseWheel', () => {
    it('clicks at the given coordinates with options', async () => {
      await GroupBrowser.mouseClick({
        browser: browser as any,
        x: 640,
        y: 360,
        options: { button: 'left', count: 2 },
      });
      expect(page.mouse.click).toHaveBeenCalledWith(640, 360, { button: 'left', count: 2 });
    });

    it('presses the mouse button down with default options (edge case)', async () => {
      await GroupBrowser.mouseDown({ browser: browser as any });
      expect(page.mouse.down).toHaveBeenCalledWith({});
    });

    it('releases the mouse button', async () => {
      await GroupBrowser.mouseUp({ browser: browser as any, options: { button: 'right' } });
      expect(page.mouse.up).toHaveBeenCalledWith({ button: 'right' });
    });

    it('moves the mouse to coordinates', async () => {
      await GroupBrowser.mouseMove({ browser: browser as any, x: 200, y: 400, options: { steps: 5 } });
      expect(page.mouse.move).toHaveBeenCalledWith(200, 400, { steps: 5 });
    });

    it('scrolls with wheel deltas', async () => {
      await GroupBrowser.mouseWheel({ browser: browser as any, options: { deltaX: 0, deltaY: 500 } });
      expect(page.mouse.wheel).toHaveBeenCalledWith({ deltaX: 0, deltaY: 500 });
    });

    it('defaults to zero deltas when options are omitted (edge case)', async () => {
      const result = await GroupBrowser.mouseWheel({ browser: browser as any } as any);
      expect(page.mouse.wheel).toHaveBeenCalledWith({ deltaX: 0, deltaY: 0 });
      expect(result).toBe(true);
    });

    it('defaults an omitted individual delta to zero', async () => {
      await GroupBrowser.mouseWheel({
        browser: browser as any,
        options: { deltaY: 300 } as any,
      });
      expect(page.mouse.wheel).toHaveBeenCalledWith({ deltaX: 0, deltaY: 300 });
    });
  });

  describe('dragAndDropByCoordinates', () => {
    it('drags from a start point to a target point', async () => {
      const result = await GroupBrowser.dragAndDropByCoordinates({
        browser: browser as any,
        start: { x: 100, y: 200 },
        target: { x: 400, y: 200 },
        steps: 20,
      });

      expect(page.mouse.move).toHaveBeenNthCalledWith(1, 100, 200);
      expect(page.mouse.down).toHaveBeenCalledTimes(1);
      expect(page.mouse.move).toHaveBeenNthCalledWith(2, 400, 200, { steps: 20 });
      expect(page.mouse.up).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('defaults steps to 10 when omitted (edge case)', async () => {
      await GroupBrowser.dragAndDropByCoordinates({
        browser: browser as any,
        start: { x: 0, y: 0 },
        target: { x: 10, y: 10 },
      });
      expect(page.mouse.move).toHaveBeenNthCalledWith(2, 10, 10, { steps: 10 });
    });
  });

  describe('dragAndDropByElements', () => {
    it('drags the source element onto the target element by bounding box', async () => {
      const source = createMockElementHandle();
      const target = createMockElementHandle();
      source.boundingBox.mockResolvedValueOnce({ x: 0, y: 0, width: 100, height: 40 });
      target.boundingBox.mockResolvedValueOnce({ x: 200, y: 0, width: 100, height: 40 });
      page.$.mockResolvedValueOnce(source).mockResolvedValueOnce(target);

      const result = await GroupBrowser.dragAndDropByElements({
        browser: browser as any,
        sourceSelector: '.draggable',
        targetSelector: '.drop-zone',
      });

      expect(page.mouse.move).toHaveBeenNthCalledWith(1, 50, 20);
      expect(page.mouse.move).toHaveBeenNthCalledWith(2, 250, 20, { steps: 10 });
      expect(result).toBe(true);
    });

    it('throws when the source or target element cannot be found', async () => {
      page.$.mockResolvedValueOnce(null).mockResolvedValueOnce(createMockElementHandle());
      await expect(
        GroupBrowser.dragAndDropByElements({
          browser: browser as any,
          sourceSelector: '.missing',
          targetSelector: '.drop-zone',
        })
      ).rejects.toThrow('Source or target element not found');
    });
  });

  // ==========================================================================
  // Transfer
  // ==========================================================================
  describe('uploadFile', () => {
    it('uploads files to a located file input', async () => {
      const handle = createMockElementHandle();
      page.$.mockResolvedValueOnce(handle);

      const result = await GroupBrowser.uploadFile({
        browser: browser as any,
        selector: '#file-input',
        filePaths: ['/tmp/document.pdf', '/tmp/attachment.zip'],
      });

      expect(handle.uploadFile).toHaveBeenCalledWith('/tmp/document.pdf', '/tmp/attachment.zip');
      expect(result).toBe(true);
    });

    it('throws when the file input is not found', async () => {
      page.$.mockResolvedValueOnce(null);
      await expect(
        GroupBrowser.uploadFile({
          browser: browser as any,
          selector: '#missing',
          filePaths: ['/tmp/document.pdf'],
        })
      ).rejects.toThrow('File input not found');
    });

    it('rejects with a validation error when filePaths is empty', async () => {
      await expect(
        GroupBrowser.uploadFile({
          browser: browser as any,
          selector: '#file-input',
          filePaths: [],
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('downloadFile', () => {
    let fs: typeof import('fs');
    let os: typeof import('os');
    let path: typeof import('path');
    let downloadDir: string;

    beforeEach(async () => {
      fs = await import('fs');
      os = await import('os');
      path = await import('path');
      downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-download-'));
    });

    afterEach(() => {
      fs.rmSync(downloadDir, { recursive: true, force: true });
    });

    it('resolves once the suggested file lands on disk without a .crdownload sibling', async () => {
      const client = { send: vi.fn().mockResolvedValue(undefined), on: vi.fn() };
      page.createCDPSession.mockResolvedValueOnce(client as any);
      page.click.mockImplementationOnce(async () => {
        const handler = client.on.mock.calls.find(([event]) => event === 'Page.downloadWillBegin')?.[1];
        fs.writeFileSync(path.join(downloadDir, 'report.pdf'), 'data');
        handler?.({ suggestedFilename: 'report.pdf' });
      });

      const result = await GroupBrowser.downloadFile({
        browser: browser as any,
        selector: 'a.download-link',
        path: downloadDir,
      });

      expect(client.send).toHaveBeenCalledWith('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
      });
      expect(result).toBe(true);
    });

    it('rejects with a validation error when selector is missing', async () => {
      await expect(
        GroupBrowser.downloadFile({ browser: browser as any, path: downloadDir } as any)
      ).rejects.toThrow();
    });

    it('rejects with "Download did not start" once the timeout elapses with no download event', async () => {
      const client = { send: vi.fn().mockResolvedValue(undefined), on: vi.fn() };
      page.createCDPSession.mockResolvedValueOnce(client as any);
      page.click.mockResolvedValueOnce(undefined);

      vi.useFakeTimers();
      const promise = GroupBrowser.downloadFile({
        browser: browser as any,
        selector: 'a.download-link',
        path: downloadDir,
      });
      // Attach the rejection assertion before advancing timers so the promise is
      // never observably unhandled between the reject() call and this assertion.
      const expectation = expect(promise).rejects.toThrow('Download did not start');

      // The source polls every 300ms for up to 480000ms via a self-rescheduling
      // setTimeout. Rather than firing all ~1600 intermediate ticks (slow), flush
      // pending microtasks so the first poll is scheduled, jump the virtual clock
      // straight past the timeout, then let exactly that one pending timer fire —
      // its elapsed-time check then rejects immediately.
      await vi.advanceTimersByTimeAsync(0);
      vi.setSystemTime(Date.now() + 480_001);
      await vi.advanceTimersToNextTimerAsync();

      await expectation;
    });
  });

  // ==========================================================================
  // Diagnostics
  // ==========================================================================
  describe('startHarCapture / stopHarCapture', () => {
    function createCdpClientMock() {
      return { send: vi.fn().mockResolvedValue(undefined), on: vi.fn(), off: vi.fn() };
    }

    afterEach(() => {
      vi.mocked(harFromMessages).mockReset();
    });

    it('returns a plain string id, not the live CDP session/listeners', async () => {
      const client = createCdpClientMock();
      page.createCDPSession.mockResolvedValueOnce(client as any);

      const id = await GroupBrowser.startHarCapture({ browser: browser as any });

      expect(typeof id).toBe('string');
      expect(() => structuredClone(id)).not.toThrow();
      expect(client.send).toHaveBeenCalledWith('Page.enable');
      expect(client.send).toHaveBeenCalledWith('Network.enable');
      // One listener per HAR_CAPTURE_EVENTS entry, including the two that matter most
      // for cache diagnostics.
      expect(client.on).toHaveBeenCalledWith('Network.responseReceived', expect.any(Function));
      expect(client.on).toHaveBeenCalledWith('Network.requestWillBeSent', expect.any(Function));
    });

    it('forwards every recorded CDP message to chrome-har and returns its result', async () => {
      const client = createCdpClientMock();
      page.createCDPSession.mockResolvedValueOnce(client as any);
      const fakeHar = { log: { version: '1.2', entries: [{ request: { url: 'https://example.com/' } }] } };
      vi.mocked(harFromMessages).mockReturnValueOnce(fakeHar as any);

      const id = await GroupBrowser.startHarCapture({ browser: browser as any });
      const responseListener = client.on.mock.calls.find(
        ([event]) => event === 'Network.responseReceived'
      )?.[1];
      const requestListener = client.on.mock.calls.find(
        ([event]) => event === 'Network.requestWillBeSent'
      )?.[1];

      requestListener?.({ requestId: '1', request: { url: 'https://example.com/' } });
      responseListener?.({ requestId: '1', response: { url: 'https://example.com/', status: 200 } });

      const har = await GroupBrowser.stopHarCapture({ browser: browser as any, capture: id });

      expect(har).toBe(fakeHar);
      expect(() => structuredClone(har)).not.toThrow();
      expect(harFromMessages).toHaveBeenCalledWith(
        expect.arrayContaining([
          { method: 'Network.requestWillBeSent', params: { requestId: '1', request: { url: 'https://example.com/' } } },
          { method: 'Network.responseReceived', params: { requestId: '1', response: { url: 'https://example.com/', status: 200 } } },
        ]),
        { includeTextFromResponseBody: false }
      );
      expect(client.off).toHaveBeenCalledWith('Network.responseReceived', responseListener);
      expect(client.send).toHaveBeenCalledWith('Network.disable');
      expect(client.send).toHaveBeenCalledWith('Page.disable');
    });

    it('rejects when stopping a capture id that was already stopped (edge case)', async () => {
      const client = createCdpClientMock();
      page.createCDPSession.mockResolvedValueOnce(client as any);
      vi.mocked(harFromMessages).mockReturnValueOnce({ log: { entries: [] } } as any);

      const id = await GroupBrowser.startHarCapture({ browser: browser as any });
      await GroupBrowser.stopHarCapture({ browser: browser as any, capture: id });

      await expect(
        GroupBrowser.stopHarCapture({ browser: browser as any, capture: id })
      ).rejects.toThrow(`No active HAR capture with id "${id}"`);
    });

    it('writes the HAR to disk when a path is given (edge case)', async () => {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-har-'));
      const harPath = path.join(dir, 'capture.har');

      try {
        const client = createCdpClientMock();
        page.createCDPSession.mockResolvedValueOnce(client as any);
        const fakeHar = { log: { version: '1.2', entries: [] } };
        vi.mocked(harFromMessages).mockReturnValueOnce(fakeHar as any);

        const id = await GroupBrowser.startHarCapture({ browser: browser as any });
        await GroupBrowser.stopHarCapture({ browser: browser as any, capture: id, path: harPath });

        expect(JSON.parse(fs.readFileSync(harPath, 'utf-8'))).toEqual(fakeHar);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
