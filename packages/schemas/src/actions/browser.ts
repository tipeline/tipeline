import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { browserSchema } from '@tipeline/types';
import { orTemplateString } from './../templateValidation';

// -----------------------------------------------
// Reusable helpers
// -----------------------------------------------
const browserId = () => z.string().min(1);

// Viewport (launch)
const viewportSchema = z
  .object({
    width: z.number().optional(),
    height: z.number().optional(),
    isMobile: z.boolean().optional(),
    isLandscape: z.boolean().optional(),
  })
  .optional();

// WaitFor (clickElement)
const waitForSchema = z
  .object({
    type: z.enum(['timeout', 'selector', 'navigation', 'networkidle']),
    timeout: z.number().optional(),
    selector: z.string().optional(),
    selectorType: z.string().optional(),
  })
  .optional();

// Attribute guard used by getElement/extractStructuredData
const isAttrAllowed = (val: string, extra: string[] = []) =>
  [
    'text',
    'src',
    'id',
    'class',
    'title',
    'href',
    'enabled',
    'visible',
    'exists',
    'ordinal',
    'innerHTML',
    'innerText',
    ...extra,
  ].includes(val) ||
  val.startsWith('data-') ||
  val.startsWith('aria-');

const elementAttribute = (extra: string[] = []) =>
  z
    .string()
    .optional()
    .default('text')
    .refine((val) => isAttrAllowed(val, extra), { message: 'Invalid attribute' });

// Screenshot options
const screenshotOptions = z.object({
  path: z.coerce.string(),
  fullPage: z.coerce.boolean(),
  quality: z.number().min(0).max(100).optional(),
  type: z.enum(['jpeg', 'png', 'webp']),
});

// Screenshot element options
const screenshotElemOptions = z.object({
  path: z.coerce.string(),
  quality: z.number().min(0).max(100).optional(),
  type: z.enum(['jpeg', 'png', 'webp']),
});

// PDF options
const pdfOptions = z.object({
  path: z.coerce.string().optional(),
  format: z.coerce.string().optional(), // e.g. 'A4'
  landscape: z.coerce.boolean().optional(),
  printBackground: z.coerce.boolean().optional(),
  displayHeaderFooter: z.coerce.boolean().optional(),
  headerTemplate: z.coerce.string().optional(),
  footerTemplate: z.coerce.string().optional(),
  margin: z
    .object({
      top: z.coerce.string().optional(),
      right: z.coerce.string().optional(),
      bottom: z.coerce.string().optional(),
      left: z.coerce.string().optional(),
    })
    .optional(),
});

// Cookie schemas
const cookieSetSchema = z
  .object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
  })
  .passthrough();

const cookieDeleteSchema = z
  .object({
    name: z.string(),
    domain: z.string(),
    path: z.string(),
    value: z.string(),
    expires: z.number(),
    size: z.number(),
    httpOnly: z.boolean(),
    secure: z.boolean(),
    session: z.boolean(),
  })
  .passthrough();

// Creation-time variants of shared schemas (accept template strings for non-string fields)
const viewportCreationSchema = z
  .object({
    width: orTemplateString(z.number()).optional(),
    height: orTemplateString(z.number()).optional(),
    isMobile: orTemplateString(z.boolean()).optional(),
    isLandscape: orTemplateString(z.boolean()).optional(),
  })
  .optional();

const waitForCreationSchema = z
  .object({
    type: orTemplateString(z.enum(['timeout', 'selector', 'navigation', 'networkidle'])),
    timeout: orTemplateString(z.number()).optional(),
    selector: z.string().optional(),
    selectorType: z.string().optional(),
  })
  .optional();

const screenshotOptionsCreation = z.object({
  path: z.coerce.string(),
  fullPage: orTemplateString(z.coerce.boolean()),
  quality: orTemplateString(z.number().min(0).max(100)).optional(),
  type: orTemplateString(z.enum(['jpeg', 'png', 'webp'])),
});

const screenshotElemOptionsCreation = z.object({
  path: z.coerce.string(),
  quality: orTemplateString(z.number().min(0).max(100)).optional(),
  type: orTemplateString(z.enum(['jpeg', 'png', 'webp'])),
});

// Convenience builders for actions that require a browser handle
const withBrowserRuntime = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ browser: browserSchema, ...shape });

const withBrowserCreation = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ browser: browserId(), ...shape });

export const meta = {
  label: 'Browser',
  icon: 'Globe',
};

export const validations = {
  // -----------------------------------------------
  // Browser Control
  // -----------------------------------------------
  launch: createValidationPair(
    {
      runtime: z.object({
        chromePath: z.string().optional(),
        headless: z.preprocess(
          (v) => (v === 'true' ? true : v === 'false' ? false : v),
          z.union([z.literal(true), z.literal(false), z.literal('shell')])
        ).optional().default(true),
        timeout: z.number().optional(),
        viewport: viewportSchema,
      }),
      creation: z.object({
        chromePath: z.string().optional(),
        headless: z.preprocess(
          (v) => (v === true ? 'true' : v === false ? 'false' : v),
          orTemplateString(z.enum(['true', 'false', 'shell']))
        ).optional().default('true'),
        timeout: orTemplateString(z.number()).optional(),
        viewport: viewportCreationSchema,
      }),
    },
    {
      label: 'Launch', icon: '🚀', category: 'browser', description: 'Start a browser instance.',
      returns: 'browser',
      fieldConfig: {
        chromePath: { description: 'Optional path to a custom Chromium/Chrome executable.' },
        headless: { description: 'Run in headless mode: true, false, or "shell".' },
        timeout: { description: 'Launch timeout in milliseconds.' },
        viewport: { description: 'Initial viewport size and mobile/landscape settings.' },
      },
    }
  ),

  close: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Close', icon: '🛑', category: 'browser', description: 'Close the browser.',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to close.' } },
    }
  ),

  emulateDevice: createValidationPair(
    {
      runtime: withBrowserRuntime({ device: z.coerce.string() }),
      creation: withBrowserCreation({ device: z.coerce.string() }),
    },
    {
      label: 'Emulate Device',
      icon: '📱',
      category: 'browser',
      description: 'Emulate a predefined device profile.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance to configure.' },
        device: { description: 'Device name to emulate (e.g. "iPhone 12", "iPad Pro").' },
      },
    }
  ),

  setGeolocation: createValidationPair(
    {
      runtime: withBrowserRuntime({
        coordinates: z.object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          accuracy: z.number().min(0).optional(),
        }),
      }),
      creation: withBrowserCreation({
        coordinates: z.object({
          latitude: orTemplateString(z.number().min(-90).max(90)),
          longitude: orTemplateString(z.number().min(-180).max(180)),
          accuracy: orTemplateString(z.number().min(0)).optional(),
        }),
      }),
    },
    {
      label: 'Set Geolocation',
      icon: '📍',
      category: 'browser',
      description: 'Set geolocation coordinates.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance to configure.' },
        coordinates: { description: 'Geolocation object with latitude, longitude, and optional accuracy.' },
      },
    }
  ),

  emulateTimezone: createValidationPair(
    {
      runtime: withBrowserRuntime({ timezoneId: z.string() }),
      creation: withBrowserCreation({ timezoneId: z.string() }),
    },
    {
      label: 'Emulate Timezone',
      icon: '🕰️',
      category: 'browser',
      description: 'Override timezone.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance to configure.' },
        timezoneId: { description: 'IANA timezone identifier (e.g. "America/New_York", "Europe/London").' },
      },
    }
  ),

  isJavaScriptEnabled: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Is JS Enabled',
      icon: '🧪',
      category: 'browser',
      description: 'Check if JavaScript is enabled.',
      returns: 'boolean',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to check.' } },
    }
  ),

  setUserAgent: createValidationPair(
    {
      runtime: withBrowserRuntime({ userAgent: z.string() }),
      creation: withBrowserCreation({ userAgent: z.string() }),
    },
    {
      label: 'Set User Agent',
      icon: '🧾',
      category: 'browser',
      description: 'Set custom user agent.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance to configure.' },
        userAgent: { description: 'Custom user agent string to set.' },
      },
    }
  ),

  getUserAgent: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Get User Agent',
      icon: '🧾',
      category: 'browser',
      description: 'Get current user agent.',
      returns: 'string',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to read the user agent from.' } },
    }
  ),

  setCacheEnabled: createValidationPair(
    {
      runtime: withBrowserRuntime({ enabled: z.boolean() }),
      creation: withBrowserCreation({ enabled: orTemplateString(z.boolean()) }),
    },
    {
      label: 'Set Cache Enabled',
      icon: '💾',
      category: 'browser',
      description: 'Enable or disable the browser\'s own HTTP cache for the current page.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance to configure.' },
        enabled: { description: 'true to use the browser cache normally, false to force every request to hit the network.' },
      },
    }
  ),

  // -----------------------------------------------
  // Page Navigation
  // -----------------------------------------------
  goTo: createValidationPair(
    {
      runtime: withBrowserRuntime({
        url: z.string().min(1, 'url is required'),
        waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).optional(),
        timeout: z.number().positive().optional(),
      }),
      creation: withBrowserCreation({
        url: z.string().min(1, 'url is required'),
        waitUntil: orTemplateString(z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2'])).optional(),
        timeout: orTemplateString(z.number().positive()).optional(),
      }),
    },
    {
      label: 'Go To', icon: '🔗', category: 'navigation',
      description: 'Navigate to a URL and return the response details (status, headers, remote address, timing).',
      returns: 'object',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance to navigate.' },
        url: { description: 'URL to navigate to.' },
        waitUntil: { description: 'Navigation wait condition: load, domcontentloaded, networkidle0, or networkidle2.' },
        timeout: { description: 'Navigation timeout in milliseconds.' },
      },
    }
  ),

  reload: createValidationPair(
    {
      runtime: withBrowserRuntime({
        waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']).optional(),
        timeout: z.number().positive().optional(),
      }),
      creation: withBrowserCreation({
        waitUntil: orTemplateString(z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2'])).optional(),
        timeout: orTemplateString(z.number().positive()).optional(),
      }),
    },
    {
      label: 'Reload', icon: '🔄', category: 'navigation', description: 'Reload the current page.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance to reload.' },
        waitUntil: { description: 'Navigation wait condition: load, domcontentloaded, networkidle0, or networkidle2. Defaults to load.' },
        timeout: { description: 'Navigation timeout in milliseconds.' },
      },
    }
  ),

  goBackPage: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Back', icon: '⬅️', category: 'navigation', description: 'Go back in history.',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to navigate back.' } },
    }
  ),

  goForwardPage: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Forward', icon: '➡️', category: 'navigation', description: 'Go forward in history.',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to navigate forward.' } },
    }
  ),

  getUrl: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Get URL', icon: '🔗', category: 'navigation', description: 'Return the current URL.',
      returns: 'string',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to get the URL from.' } },
    }
  ),

  getPageTitle: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Get Title',
      icon: '🏷️',
      category: 'navigation',
      description: 'Return the page title.',
      returns: 'string',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to get the title from.' } },
    }
  ),

  setContent: createValidationPair(
    {
      runtime: withBrowserRuntime({ content: z.string() }),
      creation: withBrowserCreation({ content: z.string() }),
    },
    {
      label: 'Set Content',
      icon: '📝',
      category: 'navigation',
      description: 'Set the page HTML content.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance to set content on.' },
        content: { description: 'HTML string to set as the page content.' },
      },
    }
  ),

  source: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Get Source', icon: '📄', category: 'navigation', description: 'Get the page source.',
      returns: 'string',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to get the source from.' } },
    }
  ),

  // -----------------------------------------------
  // Element Actions
  // -----------------------------------------------
  hoverElement: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selector: z.string().min(1, 'selector is required'),
        selectorType: z.string().optional(),
      }),
      creation: withBrowserCreation({
        selector: z.string().min(1, 'selector is required'),
        selectorType: z.string().optional(),
      }),
    },
    {
      label: 'Hover', icon: '🖱️', category: 'element', description: 'Hover over an element.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'CSS/XPath selector for the element to hover over.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
      },
    }
  ),

  clickElement: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selector: z.string(),
        selectorType: z.string().optional(),
        waitFor: waitForSchema,
      }),
      creation: withBrowserCreation({
        selector: z.string(),
        selectorType: z.string().optional(),
        waitFor: waitForCreationSchema,
      }),
    },
    {
      label: 'Click',
      icon: '🖱️',
      category: 'element',
      description: 'Click an element; optionally wait.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the element to click.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
        waitFor: { description: 'Optional wait condition after clicking (timeout, selector, navigation, or networkidle).' },
      },
    }
  ),

  focusElement: createValidationPair(
    {
      runtime: withBrowserRuntime({ selector: z.string(), selectorType: z.string().optional() }),
      creation: withBrowserCreation({ selector: z.string(), selectorType: z.string().optional() }),
    },
    {
      label: 'Focus', icon: '🎯', category: 'element', description: 'Focus an element.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the element to focus.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
      },
    }
  ),

  typeInElement: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selector: z.string(),
        selectorType: z.string().optional(),
        text: z.string(),
      }),
      creation: withBrowserCreation({
        selector: z.string(),
        selectorType: z.string().optional(),
        text: z.string(),
      }),
    },
    {
      label: 'Type', icon: '⌨️', category: 'element', description: 'Type text into an element.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the input element to type into.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
        text: { description: 'Text to type into the element.' },
      },
    }
  ),

  getElement: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selector: z.string(),
        selectorType: z.string().optional(),
        attribute: elementAttribute(),
        waitFor: waitForSchema,
      }),
      creation: withBrowserCreation({
        selector: z.string(),
        selectorType: z.string().optional(),
        attribute: elementAttribute(),
        waitFor: waitForCreationSchema,
      }),
    },
    {
      label: 'Get Element',
      icon: '🔍',
      category: 'element',
      description: 'Read an attribute/text from an element.',
      returns: 'string',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the element to read.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
        attribute: { description: 'Attribute or property to read (e.g. text, href, src, id, class).' },
        waitFor: { description: 'Optional wait condition before reading (timeout, selector, navigation, or networkidle).' },
      },
    }
  ),

  getElements: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selector: z.string().min(1),
        selectorType: z.string().optional(),
        attribute: elementAttribute(),
      }),
      creation: withBrowserCreation({
        selector: z.string().min(1),
        selectorType: z.string().optional(),
        attribute: elementAttribute(),
      }),
    },
    {
      label: 'Get Elements',
      icon: '📋',
      category: 'element',
      description: 'Read an attribute/text from multiple matching elements.',
      returns: 'array',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector to match multiple elements.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
        attribute: { description: 'Attribute or property to read from each element.' },
      },
    }
  ),

  extractStructuredData: createValidationPair(
    {
      runtime: withBrowserRuntime({
        itemSelector: z.string().min(1),
        selectorType: z.string().optional(),
        fieldSelectors: z.array(
          z.object({
            selector: z.string().min(1),
            selectorType: z.string().optional(),
            attribute: elementAttribute(['src']),
          })
        ),
      }),
      creation: withBrowserCreation({
        itemSelector: z.string().min(1),
        selectorType: z.string().optional(),
        fieldSelectors: z.array(
          z.object({
            selector: z.string().min(1),
            selectorType: z.string().optional(),
            attribute: elementAttribute(['src']),
          })
        ),
      }),
    },
    {
      label: 'Extract Structured Data',
      icon: '🧾',
      category: 'element',
      description: 'Scrape lists/cards into structured records.',
      returns: 'array',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        itemSelector: { description: 'Selector for each repeating item (e.g. a card or list row).' },
        selectorType: { description: 'Selector strategy for itemSelector.' },
        fieldSelectors: { description: 'Array of field definitions, each with a selector and attribute to extract.' },
      },
    }
  ),

  setCheckState: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selector: z.string(),
        selectorType: z.string().optional(),
        checked: z.boolean(),
      }),
      creation: withBrowserCreation({
        selector: z.string(),
        selectorType: z.string().optional(),
        checked: orTemplateString(z.boolean()),
      }),
    },
    {
      label: 'Set Check State',
      icon: '✅',
      category: 'element',
      description: 'Set a checkbox to checked/unchecked.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the checkbox element.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
        checked: { description: 'Whether to check (true) or uncheck (false) the checkbox.' },
      },
    }
  ),

  getCheckState: createValidationPair(
    {
      runtime: withBrowserRuntime({ selector: z.string(), selectorType: z.string().optional() }),
      creation: withBrowserCreation({ selector: z.string(), selectorType: z.string().optional() }),
    },
    {
      label: 'Get Check State',
      icon: '☑️',
      category: 'element',
      description: 'Read a checkbox state.',
      returns: 'boolean',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the checkbox element.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
      },
    }
  ),

  setSelectState: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selector: z.string(),
        selectorType: z.string().optional(),
        value: z.union([z.string(), z.array(z.string())]),
      }),
      creation: withBrowserCreation({
        selector: z.string(),
        selectorType: z.string().optional(),
        value: z.union([z.string(), z.array(z.string())]),
      }),
    },
    {
      label: 'Set Select',
      icon: '🎚️',
      category: 'element',
      description: 'Choose option(s) in a dropdown (select) field.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the dropdown (select) element.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
        value: { description: 'Value(s) to select — a single string or array for multi-select.' },
      },
    }
  ),

  getSelectState: createValidationPair(
    {
      runtime: withBrowserRuntime({ selector: z.string(), selectorType: z.string().optional() }),
      creation: withBrowserCreation({ selector: z.string(), selectorType: z.string().optional() }),
    },
    {
      label: 'Get Select',
      icon: '🎚️',
      category: 'element',
      description: 'Read selected option(s).',
      returns: 'array',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the dropdown (select) element.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
      },
    }
  ),

  contains: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selectorType: z.string().optional(),
        mode: z.enum([
          'contain-element',
          'not-contain-element',
          'contain-text',
          'not-contain-text',
        ]),
        value: z.string(),
      }),
      creation: withBrowserCreation({
        selectorType: z.string().optional(),
        mode: z.enum([
          'contain-element',
          'not-contain-element',
          'contain-text',
          'not-contain-text',
        ]),
        value: z.string(),
      }),
    },
    {
      label: 'Contains',
      icon: '🔎',
      category: 'assert',
      description: 'Assertions for element/text presence.',
      returns: 'boolean',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selectorType: { description: 'Selector strategy used for the assertion.' },
        mode: { description: 'Assertion mode: contain-element, not-contain-element, contain-text, or not-contain-text.' },
        value: { description: 'Selector or text to assert the presence or absence of.' },
      },
    }
  ),

  runJavaScript: createValidationPair(
    {
      runtime: withBrowserRuntime({
        script: z.string(),
        context: z.record(z.string(), z.any()).optional(),
      }),
      creation: withBrowserCreation({
        script: z.string(),
        context: z.record(z.string(), z.any()).optional(),
      }),
    },
    {
      label: 'Run JavaScript',
      icon: '🧠',
      category: 'advanced',
      description: 'Execute JS in the page context.',
      returns: 'any',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        script: { description: 'JavaScript code to execute in the page context.' },
        context: { description: 'Optional variables to expose to the script.' },
      },
    }
  ),

  // -----------------------------------------------
  // Page Content
  // -----------------------------------------------
  takeScreenshot: createValidationPair(
    {
      runtime: withBrowserRuntime({ options: screenshotOptions }),
      creation: withBrowserCreation({ options: screenshotOptionsCreation }),
    },
    {
      label: 'Screenshot', icon: '📸', category: 'content', description: 'Capture a screenshot.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        options: { description: 'Screenshot options: path, fullPage, quality, and type (jpeg/png/webp).' },
      },
    }
  ),

  takeScreenshotElement: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selector: z.string().min(1),
        selectorType: z.string().optional().default('css'),
        options: screenshotElemOptions,
      }),
      creation: withBrowserCreation({
        selector: z.string().min(1),
        selectorType: z.string().optional().default('css'),
        options: screenshotElemOptionsCreation,
      }),
    },
    {
      label: 'Screenshot Element',
      icon: '📸',
      category: 'content',
      description: 'Capture an element screenshot.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the element to screenshot.' },
        selectorType: { description: 'Selector strategy (default css).' },
        options: { description: 'Screenshot options: path, quality, and type (jpeg/png/webp).' },
      },
    }
  ),

  startScreencast: createValidationPair(
    {
      runtime: withBrowserRuntime({
        options: z.object({
          path: z.string(),
          quality: z.number().min(0).max(63).optional(),
          format: z.enum(['gif', 'webm', 'mp4']).optional(),
        }),
      }),
      creation: withBrowserCreation({
        options: z.object({
          path: z.string(),
          quality: orTemplateString(z.number().min(0).max(63)).optional(),
          format: orTemplateString(z.enum(['gif', 'webm', 'mp4'])).optional(),
        }),
      }),
    },
    {
      label: 'Start Screencast',
      icon: '🎥',
      category: 'content',
      description: 'Begin recording a screencast.',
      returns: 'object',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        options: { description: 'Screencast options: path, quality (0–63), and format (gif/webm/mp4).' },
      },
    }
  ),

  stopScreencast: createValidationPair(
    {
      runtime: withBrowserRuntime({ recorder: z.any() }),
      creation: withBrowserCreation({ recorder: z.any() }),
    },
    {
      label: 'Stop Screencast',
      icon: '🛑',
      category: 'content',
      description: 'Stop recording a screencast.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        recorder: { description: 'The recorder object returned by Start Screencast.' },
      },
    }
  ),

  generatePDF: createValidationPair(
    {
      runtime: withBrowserRuntime({ options: pdfOptions }),
      creation: withBrowserCreation({ options: pdfOptions }),
    },
    {
      label: 'Generate PDF',
      icon: '🖨️',
      category: 'content',
      description: 'Generate a PDF of the page.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        options: { description: 'PDF options: path, format (e.g. A4), landscape, printBackground, margins, headers/footers.' },
      },
    }
  ),

  wait: createValidationPair(
    {
      runtime: withBrowserRuntime({
        type: z.enum(['timeout', 'selector', 'navigation', 'networkidle']),
        timeout: z.number().optional(),
        selector: z.string().optional(),
        selectorType: z.string().optional(),
      }),
      creation: withBrowserCreation({
        type: orTemplateString(z.enum(['timeout', 'selector', 'navigation', 'networkidle'])),
        timeout: orTemplateString(z.number()).optional(),
        selector: z.string().optional(),
        selectorType: z.string().optional(),
      }),
    },
    {
      label: 'Wait',
      icon: '⏱️',
      category: 'content',
      description: 'Wait for timeout, selector, or events.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        type: { description: 'What to wait for: timeout, selector, navigation, or networkidle.' },
        timeout: { description: 'Maximum time to wait in milliseconds.' },
        selector: { description: 'CSS/XPath selector to wait for (when type is selector).' },
        selectorType: { description: 'Selector strategy for the selector.' },
      },
    }
  ),

  metadata: createValidationPair(
    {
      runtime: withBrowserRuntime({ name: z.string().min(1) }),
      creation: withBrowserCreation({ name: z.string().min(1) }),
    },
    {
      label: 'Metadata',
      icon: '🏷️',
      category: 'content',
      description: 'Get named metadata (e.g., description).',
      returns: 'array',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        name: { description: 'Name of the metadata attribute to retrieve (e.g. "description", "keywords").' },
      },
    }
  ),

  addStyleTag: createValidationPair(
    {
      runtime: withBrowserRuntime({ css: z.any() }),
      creation: withBrowserCreation({ css: z.any() }),
    },
    {
      label: 'Add Style Tag',
      icon: '🎨',
      category: 'content',
      description: 'Inject CSS into the page.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        css: { description: 'CSS string or style object to inject into the page.' },
      },
    }
  ),

  getCookies: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Get Cookies', icon: '🍪', category: 'content', description: 'Read browser cookies.',
      returns: 'array',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to read cookies from.' } },
    }
  ),

  setCookies: createValidationPair(
    {
      runtime: withBrowserRuntime({ cookies: z.array(cookieSetSchema) }),
      creation: withBrowserCreation({ cookies: z.array(cookieSetSchema) }),
    },
    {
      label: 'Set Cookies',
      icon: '🍪',
      category: 'content',
      description: 'Set cookies on the page.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        cookies: { description: 'Array of cookie objects with name, value, and domain.' },
      },
    }
  ),

  deleteCookies: createValidationPair(
    {
      runtime: withBrowserRuntime({ cookies: z.array(cookieDeleteSchema) }),
      creation: withBrowserCreation({ cookies: z.array(cookieDeleteSchema) }),
    },
    {
      label: 'Delete Cookies',
      icon: '🗑️',
      category: 'content',
      description: 'Delete cookies from the page.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        cookies: { description: 'Array of cookie objects to delete.' },
      },
    }
  ),

  // -----------------------------------------------
  // Interactions
  // -----------------------------------------------
  getViewport: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Get Viewport',
      icon: '🖼️',
      category: 'interaction',
      description: 'Get current viewport.',
      returns: 'object',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance to get the viewport from.' } },
    }
  ),

  setViewport: createValidationPair(
    {
      runtime: withBrowserRuntime({ width: z.number().min(0), height: z.number().min(0) }),
      creation: withBrowserCreation({ width: orTemplateString(z.number().min(0)), height: orTemplateString(z.number().min(0)) }),
    },
    {
      label: 'Set Viewport',
      icon: '🖼️',
      category: 'interaction',
      description: 'Resize the viewport.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        width: { description: 'Viewport width in pixels.' },
        height: { description: 'Viewport height in pixels.' },
      },
    }
  ),

  keyboardType: createValidationPair(
    {
      runtime: withBrowserRuntime({
        text: z.string(),
        selector: z.coerce.string().optional(),
        selectorType: z.string().optional(),
        options: z.object({ delay: z.coerce.number().min(0) }).optional(),
      }),
      creation: withBrowserCreation({
        text: z.string(),
        selector: z.coerce.string().optional(),
        selectorType: z.string().optional(),
        options: z.object({ delay: z.coerce.number().min(0) }).optional(),
      }),
    },
    {
      label: 'Keyboard Type',
      icon: '⌨️',
      category: 'interaction',
      description: 'Type keystrokes with optional delay.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        text: { description: 'Text to type.' },
        selector: { description: 'Optional selector to focus before typing.' },
        selectorType: { description: 'Selector strategy for the optional selector.' },
        options: { description: 'Optional typing options (delay in ms between keystrokes).' },
      },
    }
  ),

  keyboardDown: createValidationPair(
    {
      runtime: withBrowserRuntime({ key: z.string() }),
      creation: withBrowserCreation({ key: z.string() }),
    },
    {
      label: 'Key Down', icon: '⬇️', category: 'interaction', description: 'Press and hold a key.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        key: { description: 'Key name to press (e.g. "Enter", "ArrowLeft", "Shift").' },
      },
    }
  ),

  keyboardUp: createValidationPair(
    {
      runtime: withBrowserRuntime({ key: z.string() }),
      creation: withBrowserCreation({ key: z.string() }),
    },
    {
      label: 'Key Up', icon: '⬆️', category: 'interaction', description: 'Release a key.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        key: { description: 'Key name to release.' },
      },
    }
  ),

  keyboardPress: createValidationPair(
    {
      runtime: withBrowserRuntime({ key: z.string() }),
      creation: withBrowserCreation({ key: z.string() }),
    },
    {
      label: 'Key Press', icon: '🔘', category: 'interaction', description: 'Press a key.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        key: { description: 'Key name to press (press and release).' },
      },
    }
  ),

  keyboardSendCharacter: createValidationPair(
    {
      runtime: withBrowserRuntime({ char: z.string() }),
      creation: withBrowserCreation({ char: z.string() }),
    },
    {
      label: 'Send Character',
      icon: '🔤',
      category: 'interaction',
      description: 'Send a raw character.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        char: { description: 'A single character to dispatch as a keyboard event.' },
      },
    }
  ),

  mouseClick: createValidationPair(
    {
      runtime: withBrowserRuntime({
        x: z.number(),
        y: z.number(),
        options: z
          .object({
            button: z.enum(['left', 'right', 'middle']).optional(),
            count: z.number().min(1).optional(),
            delay: z.number().min(0).optional(),
          })
          .optional(),
      }),
      creation: withBrowserCreation({
        x: orTemplateString(z.number()),
        y: orTemplateString(z.number()),
        options: z
          .object({
            button: orTemplateString(z.enum(['left', 'right', 'middle'])).optional(),
            count: orTemplateString(z.number().min(1)).optional(),
            delay: orTemplateString(z.number().min(0)).optional(),
          })
          .optional(),
      }),
    },
    {
      label: 'Mouse Click',
      icon: '🖱️',
      category: 'interaction',
      description: 'Click at page coordinates.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        x: { description: 'Horizontal page coordinate to click.' },
        y: { description: 'Vertical page coordinate to click.' },
        options: { description: 'Click options: button (left/right/middle), count, and delay.' },
      },
    }
  ),

  mouseDown: createValidationPair(
    {
      runtime: withBrowserRuntime({
        options: z.object({ button: z.enum(['left', 'right', 'middle']).optional() }).optional(),
      }),
      creation: withBrowserCreation({
        options: z.object({ button: orTemplateString(z.enum(['left', 'right', 'middle'])).optional() }).optional(),
      }),
    },
    {
      label: 'Mouse Down', icon: '🖱️', category: 'interaction', description: 'Mouse button down.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        options: { description: 'Optional button to press down: left, right, or middle.' },
      },
    }
  ),

  mouseUp: createValidationPair(
    {
      runtime: withBrowserRuntime({
        options: z.object({ button: z.enum(['left', 'right', 'middle']).optional() }).optional(),
      }),
      creation: withBrowserCreation({
        options: z.object({ button: orTemplateString(z.enum(['left', 'right', 'middle'])).optional() }).optional(),
      }),
    },
    {
      label: 'Mouse Up', icon: '🖱️', category: 'interaction', description: 'Mouse button up.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        options: { description: 'Optional button to release: left, right, or middle.' },
      },
    }
  ),

  mouseMove: createValidationPair(
    {
      runtime: withBrowserRuntime({
        x: z.number(),
        y: z.number(),
        options: z.object({ steps: z.number().min(1).optional() }).optional(),
      }),
      creation: withBrowserCreation({
        x: orTemplateString(z.number()),
        y: orTemplateString(z.number()),
        options: z.object({ steps: orTemplateString(z.number().min(1)).optional() }).optional(),
      }),
    },
    {
      label: 'Mouse Move',
      icon: '🖱️',
      category: 'interaction',
      description: 'Move mouse to coordinates.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        x: { description: 'Target horizontal page coordinate.' },
        y: { description: 'Target vertical page coordinate.' },
        options: { description: 'Optional steps for smooth movement.' },
      },
    }
  ),

  mouseWheel: createValidationPair(
    {
      runtime: withBrowserRuntime({
        options: z
          .object({ deltaX: z.number().optional(), deltaY: z.number().optional() })
          .optional(),
      }),
      creation: withBrowserCreation({
        options: z
          .object({
            deltaX: orTemplateString(z.number()).optional(),
            deltaY: orTemplateString(z.number()).optional(),
          })
          .optional(),
      }),
    },
    {
      label: 'Mouse Wheel', icon: '🖱️', category: 'interaction', description: 'Scroll the page.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        options: { description: 'Scroll deltas: deltaX (horizontal) and deltaY (vertical) in pixels.' },
      },
    }
  ),

  dragAndDropByCoordinates: createValidationPair(
    {
      runtime: withBrowserRuntime({
        start: z.object({ x: z.number(), y: z.number() }),
        target: z.object({ x: z.number(), y: z.number() }),
        steps: z.number().min(1).optional(),
      }),
      creation: withBrowserCreation({
        start: z.object({ x: orTemplateString(z.number()), y: orTemplateString(z.number()) }),
        target: z.object({ x: orTemplateString(z.number()), y: orTemplateString(z.number()) }),
        steps: orTemplateString(z.number().min(1)).optional(),
      }),
    },
    {
      label: 'Drag & Drop (XY)',
      icon: '🧲',
      category: 'interaction',
      description: 'Drag from XY to XY.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        start: { description: 'Starting coordinates {x, y} for the drag.' },
        target: { description: 'Target coordinates {x, y} to drop at.' },
        steps: { description: 'Number of intermediate steps for smooth dragging.' },
      },
    }
  ),

  dragAndDropByElements: createValidationPair(
    {
      runtime: withBrowserRuntime({
        sourceSelector: z.string(),
        targetSelector: z.string(),
        selectorType: z.enum(['css', 'xpath', 'text', 'aria']).optional(),
        steps: z.number().min(1).optional(),
      }),
      creation: withBrowserCreation({
        sourceSelector: z.string(),
        targetSelector: z.string(),
        selectorType: orTemplateString(z.enum(['css', 'xpath', 'text', 'aria'])).optional(),
        steps: orTemplateString(z.number().min(1)).optional(),
      }),
    },
    {
      label: 'Drag & Drop (Elements)',
      icon: '🧲',
      category: 'interaction',
      description: 'Drag one element to another.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        sourceSelector: { description: 'Selector for the element to drag.' },
        targetSelector: { description: 'Selector for the element to drop onto.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
        steps: { description: 'Number of intermediate steps for smooth dragging.' },
      },
    }
  ),

  uploadFile: createValidationPair(
    {
      runtime: withBrowserRuntime({
        selector: z.string().min(1, 'browser.selector.required'),
        selectorType: z.enum(['css', 'xpath', 'text', 'aria']).optional(),
        filePaths: z
          .array(z.string().min(1, 'browser.filePath.itemRequired'))
          .min(1, 'browser.filePath.minCount'),
      }),
      creation: withBrowserCreation({
        selector: z.string().min(1, 'browser.selector.required'),
        selectorType: z.enum(['css', 'xpath', 'text', 'aria']).optional(),
        filePaths: z
          .array(z.string().min(1, 'browser.filePath.itemRequired'))
          .min(1, 'browser.filePath.minCount'),
      }),
    },
    {
      label: 'Upload File',
      icon: '📤',
      category: 'interaction',
      description: 'Upload files via a file input field.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        selector: { description: 'Selector for the file input element.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
        filePaths: { description: 'Array of local file paths to upload.' },
      },
    }
  ),

  downloadFile: createValidationPair(
    {
      runtime: withBrowserRuntime({
        path: z.string().min(1),
        selector: z.string().min(1, 'browser.selector.required'),
        selectorType: z.enum(['css', 'xpath', 'text', 'aria']).optional(),
      }),
      creation: withBrowserCreation({
        path: z.string().min(1),
        selector: z.string().min(1, 'browser.selector.required'),
        selectorType: z.enum(['css', 'xpath', 'text', 'aria']).optional(),
      }),
    },
    {
      label: 'Download File',
      icon: '📥',
      category: 'interaction',
      description: 'Trigger a download to a path.',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        path: { description: 'Local directory path to save the downloaded file.' },
        selector: { description: 'Selector for the element that triggers the download.' },
        selectorType: { description: 'Selector strategy: css, xpath, text, or aria.' },
      },
    }
  ),

  // -----------------------------------------------
  // Diagnostics
  // -----------------------------------------------
  runLighthouseAudit: createValidationPair(
    {
      runtime: withBrowserRuntime({
        url: z.string().min(1, 'url is required'),
        categories: z
          .array(z.enum(['performance', 'accessibility', 'best-practices', 'seo']))
          .optional(),
      }),
      creation: withBrowserCreation({
        url: z.string().min(1, 'url is required'),
        categories: z
          .array(z.enum(['performance', 'accessibility', 'best-practices', 'seo']))
          .optional(),
      }),
    },
    {
      label: 'Run Lighthouse Audit',
      icon: '🔦',
      category: 'advanced',
      description: 'Run a Lighthouse audit against a URL and return category scores, audit results, and any auto-detected stack-specific advice (e.g. Drupal, WordPress).',
      returns: 'object',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance to audit against (its debugging port is reused).' },
        url: { description: 'URL to audit.' },
        categories: {
          description:
            'Which Lighthouse categories to run: performance, accessibility, best-practices, seo. Defaults to all. Each category bundles many individual audits (e.g. performance includes uses-long-cache-ttl, server-response-time) — you cannot select a single audit directly, only the category it belongs to.',
        },
      },
    }
  ),

  startHarCapture: createValidationPair(
    {
      runtime: withBrowserRuntime({}),
      creation: withBrowserCreation({}),
    },
    {
      label: 'Start HAR Capture',
      icon: '📼',
      category: 'advanced',
      description:
        'Begin recording a HAR (HTTP Archive) capture of every request/response on the page — headers, timing, cache status, and cookies. Does not capture response bodies.',
      returns: 'string',
      fieldConfig: { browser: { component: 'browser-select', description: 'The browser instance.' } },
    }
  ),

  stopHarCapture: createValidationPair(
    {
      runtime: withBrowserRuntime({
        capture: z.string(),
        path: z.string().optional(),
      }),
      creation: withBrowserCreation({
        capture: z.string(),
        path: orTemplateString(z.string()).optional(),
      }),
    },
    {
      label: 'Stop HAR Capture',
      icon: '🛑',
      category: 'advanced',
      description:
        'Stop a HAR capture and return the HAR object (log.entries[] holds one item per request/response). Optionally also writes it to a .har file.',
      returns: 'object',
      fieldConfig: {
        browser: { component: 'browser-select', description: 'The browser instance.' },
        capture: { description: 'The capture id returned by Start HAR Capture.' },
        path: { description: 'Optional local file path to also write the HAR JSON to.' },
      },
    }
  ),
};
