<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Browser Actions

## General

### `launch`

Launches a new browser instance using a locally installed Chrome or Chromium.

**Returns:** The Puppeteer `Browser` instance.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `chromePath` | string |  | — | Optional path to a custom Chromium/Chrome executable. |
| `headless` | `true` \| `false` \| `shell` |  | true | Run in headless mode: true, false, or "shell". |
| `timeout` | number |  | — | Launch timeout in milliseconds. |
| `viewport` | object |  | — | Initial viewport size and mobile/landscape settings. |

```yaml
# Launch a headless browser at 1280×720 and store it in browserInstance
- group: browser
  name: launch
  params:
    headless: true
    timeout: 30000
    viewport:
      width: 1280
      height: 720
      isMobile: false
      isLandscape: false
  destination: browserInstance
```

### `close`

Closes an open browser instance and frees its resources.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to close. |

```yaml
# Close the browser at the end of the pipeline
- group: browser
  name: close
  params:
    browser: '{= browserInstance =}'
```

### `emulateDevice`

Emulates a predefined device profile, overriding viewport, user agent, and touch support.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to configure. |
| `device` | string | ✓ | — | Device name to emulate (e.g. "iPhone 12", "iPad Pro"). |

```yaml
# Emulate an iPhone 15 to test mobile rendering
- group: browser
  name: emulateDevice
  params:
    browser: '{= browserInstance =}'
    device: 'iPhone 15'
```

### `setGeolocation`

Overrides the GPS coordinates reported to the page via the Geolocation API.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to configure. |
| `coordinates` | object | ✓ | — | Geolocation object with latitude, longitude, and optional accuracy. |

```yaml
# Set geolocation to San Francisco
- group: browser
  name: setGeolocation
  params:
    browser: '{= browserInstance =}'
    coordinates:
      latitude: 37.7749
      longitude: -122.4194
      accuracy: 50
```

### `emulateTimezone`

Overrides the timezone reported by the JavaScript `Date` API.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to configure. |
| `timezoneId` | string | ✓ | — | IANA timezone identifier (e.g. "America/New_York", "Europe/London"). |

```yaml
# Force the page to use the New York timezone
- group: browser
  name: emulateTimezone
  params:
    browser: '{= browserInstance =}'
    timezoneId: 'America/New_York'
```

### `isJavaScriptEnabled`

Returns whether JavaScript execution is currently enabled for the page.

**Returns:** `true` if JavaScript is enabled, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to check. |

```yaml
- group: browser
  name: isJavaScriptEnabled
  params:
    browser: '{= browserInstance =}'
  destination: jsEnabled
```

### `setUserAgent`

Sets a custom User-Agent string for all requests made by the page.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to configure. |
| `userAgent` | string | ✓ | — | Custom user agent string to set. |

```yaml
# Override the user agent to simulate a custom bot
- group: browser
  name: setUserAgent
  params:
    browser: '{= browserInstance =}'
    userAgent: 'Mozilla/5.0 (compatible; Tipeline/1.0)'
```

### `getUserAgent`

Returns the current User-Agent string reported by `navigator.userAgent`.

**Returns:** The current user agent string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to read the user agent from. |

```yaml
- group: browser
  name: getUserAgent
  params:
    browser: '{= browserInstance =}'
  destination: userAgent
```

### `setCacheEnabled`

Enables or disables the browser's own HTTP cache for the current page. Disable it
before a request when you need to guarantee a real network round-trip instead of a
response served from Chrome's disk/memory cache.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to configure. |
| `enabled` | boolean | ✓ | — | true to use the browser cache normally, false to force every request to hit the network. |

```yaml
# Force the next navigation to hit the network, bypassing the browser's own cache
- group: browser
  name: setCacheEnabled
  params:
    browser: '{= browserInstance =}'
    enabled: false
```

### `goTo`

Navigates the browser to a URL or a local HTML file path.

**Returns:** The full response details: status, statusText, ok, url, headers, remoteAddress,
fromCache, fromServiceWorker, and timing.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to navigate. |
| `url` | string | ✓ | — | URL to navigate to. |
| `waitUntil` | `load` \| `domcontentloaded` \| `networkidle0` \| `networkidle2` |  | — | Navigation wait condition: load, domcontentloaded, networkidle0, or networkidle2. |
| `timeout` | number |  | — | Navigation timeout in milliseconds. |

```yaml
# Navigate to a URL and wait for the DOM to be ready
- group: browser
  name: goTo
  params:
    browser: '{= browserInstance =}'
    url: 'https://example.com'
    waitUntil: domcontentloaded
    timeout: 30000
  destination: response
# response.status, response.headers['x-drupal-cache'], response.remoteAddress, ...
```

### `reload`

Reloads the current page.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to reload. |
| `waitUntil` | `load` \| `domcontentloaded` \| `networkidle0` \| `networkidle2` |  | — | Navigation wait condition: load, domcontentloaded, networkidle0, or networkidle2. Defaults to load. |
| `timeout` | number |  | — | Navigation timeout in milliseconds. |

```yaml
# Reload and wait for the lenient "no more than 2 connections" condition — the
# strict `wait: networkidle` action (zero connections) can hang indefinitely on
# real sites with persistent background chatter (analytics, ads, chat widgets).
- group: browser
  name: reload
  params:
    browser: '{= browserInstance =}'
    waitUntil: networkidle2
    timeout: 30000
```

### `goBackPage`

Navigates back one step in the browser history.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to navigate back. |

```yaml
- group: browser
  name: goBackPage
  params:
    browser: '{= browserInstance =}'
```

### `goForwardPage`

Navigates forward one step in the browser history.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to navigate forward. |

```yaml
- group: browser
  name: goForwardPage
  params:
    browser: '{= browserInstance =}'
```

### `getUrl`

Returns the current page URL.

**Returns:** The current URL string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to get the URL from. |

```yaml
- group: browser
  name: getUrl
  params:
    browser: '{= browserInstance =}'
  destination: currentUrl
```

### `getPageTitle`

Returns the current page `<title>`.

**Returns:** The page title string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to get the title from. |

```yaml
- group: browser
  name: getPageTitle
  params:
    browser: '{= browserInstance =}'
  destination: pageTitle
```

### `setContent`

Replaces the entire page content with a custom HTML string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to set content on. |
| `content` | string | ✓ | — | HTML string to set as the page content. |

```yaml
# Inject a custom HTML page for testing or rendering
- group: browser
  name: setContent
  params:
    browser: '{= browserInstance =}'
    content: '<h1>Hello Tipeline</h1>'
```

### `source`

Returns the full outer HTML source of the current page.

**Returns:** The page HTML as a string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to get the source from. |

```yaml
- group: browser
  name: source
  params:
    browser: '{= browserInstance =}'
  destination: pageHtml
```

### `hoverElement`

Moves the mouse cursor over an element without clicking it.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | CSS/XPath selector for the element to hover over. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |

```yaml
# Hover over a nav dropdown to reveal its sub-menu
- group: browser
  name: hoverElement
  params:
    browser: '{= browserInstance =}'
    selector: '#main-nav .dropdown'
    selectorType: css
```

### `clickElement`

Clicks an element, with optional waiting strategy before or after the click.

Supported `waitFor.type` values:
- `timeout` — wait for a selector to appear before clicking
- `selector` — click then wait for another selector to appear
- `navigation` — click then wait for navigation to complete
- `networkidle` — click then wait for no pending network requests

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the element to click. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |
| `waitFor` | object |  | — | Optional wait condition after clicking (timeout, selector, navigation, or networkidle). |

```yaml
# Click a submit button and wait for navigation to complete
- group: browser
  name: clickElement
  params:
    browser: '{= browserInstance =}'
    selector: '#submit-btn'
    selectorType: css
    waitFor:
      type: navigation
```

### `focusElement`

Gives keyboard focus to an element.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the element to focus. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |

```yaml
- group: browser
  name: focusElement
  params:
    browser: '{= browserInstance =}'
    selector: '#search-input'
    selectorType: css
```

### `typeInElement`

Types a string into an element character by character, simulating keyboard input.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the input element to type into. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |
| `text` | string | ✓ | — | Text to type into the element. |

```yaml
# Type a search query into the search box
- group: browser
  name: typeInElement
  params:
    browser: '{= browserInstance =}'
    selector: '#search-input'
    selectorType: css
    text: 'browser automation'
```

### `getElement`

Reads a specific attribute or text from a single element.

Supported `attribute` values: `text`, `id`, `class`, `title`, `href`, `src`,
`enabled`, `visible`, `exists`, `ordinal`, `innerHTML`, `innerText`, `data-*`, `aria-*`.

The optional `waitFor` block controls when to begin reading:
- `timeout` — wait for the element to appear before reading
- `selector` — wait for a different selector first
- `navigation` — wait for navigation to complete
- `networkidle` — wait for network to go idle

**Returns:** The attribute value, or `false` if the element is not found and attribute is `exists`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the element to read. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |
| `attribute` | string | ✓ | — | Attribute or property to read (e.g. text, href, src, id, class). |
| `waitFor` | object |  | — | Optional wait condition before reading (timeout, selector, navigation, or networkidle). |

```yaml
# Read the heading text after the page loads
- group: browser
  name: getElement
  params:
    browser: '{= browserInstance =}'
    selector: '#firstHeading'
    selectorType: css
    attribute: text
  destination: headingText
```

### `getElements`

Reads an attribute or text from all elements matching a selector, returning an array.

**Returns:** An array of non-empty string values from the matching elements.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector to match multiple elements. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |
| `attribute` | string | ✓ | — | Attribute or property to read from each element. |

```yaml
# Collect all link texts from a results list
- group: browser
  name: getElements
  params:
    browser: '{= browserInstance =}'
    selector: 'ul.results li a'
    selectorType: css
    attribute: text
  destination: resultItems
```

### `extractStructuredData`

Scrapes a repeated set of DOM elements into a 2-D array of field values.

Each row corresponds to one `itemSelector` match. Within each row, each column
corresponds to one entry in `fieldSelectors`, read from the matched child element.

**Returns:** A 2-D array where each inner array is one scraped row of field values.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `itemSelector` | string | ✓ | — | Selector for each repeating item (e.g. a card or list row). |
| `selectorType` | string |  | — | Selector strategy for itemSelector. |
| `fieldSelectors` | object[] | ✓ | — | Array of field definitions, each with a selector and attribute to extract. |

```yaml
# Scrape a product table — each row yields [name, price, link]
- group: browser
  name: extractStructuredData
  params:
    browser: '{= browserInstance =}'
    itemSelector: 'table.products tr'
    selectorType: css
    fieldSelectors:
      - selector: 'td.name'
        selectorType: css
        attribute: text
      - selector: 'td.price'
        selectorType: css
        attribute: text
      - selector: 'td a'
        selectorType: css
        attribute: href
  destination: productRows
```

### `setCheckState`

Sets a checkbox or ARIA checkbox element to a checked or unchecked state.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the checkbox element. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |
| `checked` | boolean | ✓ | — | Whether to check (true) or uncheck (false) the checkbox. |

```yaml
# Accept terms and conditions
- group: browser
  name: setCheckState
  params:
    browser: '{= browserInstance =}'
    selector: '#agree-terms'
    selectorType: css
    checked: true
```

### `getCheckState`

Reads the checked state of a native checkbox or ARIA checkbox element.

**Returns:** `true` if checked, `false` otherwise.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the checkbox element. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |

```yaml
- group: browser
  name: getCheckState
  params:
    browser: '{= browserInstance =}'
    selector: '#agree-terms'
    selectorType: css
  destination: isChecked
```

### `setSelectState`

Selects one or more options in a `<select>` element by their value attributes.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the dropdown (select) element. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |
| `value` | string \| string[] | ✓ | — | Value(s) to select — a single string or array for multi-select. |

```yaml
# Select a country from a dropdown
- group: browser
  name: setSelectState
  params:
    browser: '{= browserInstance =}'
    selector: '#country-select'
    selectorType: css
    value: 'US'
```

### `getSelectState`

Returns the currently selected option values from a `<select>` element.

**Returns:** An array of selected option `value` strings.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the dropdown (select) element. |
| `selectorType` | string |  | — | Selector strategy: css, xpath, text, or aria. |

```yaml
- group: browser
  name: getSelectState
  params:
    browser: '{= browserInstance =}'
    selector: '#country-select'
    selectorType: css
  destination: selectedCountries
```

### `contains`

Asserts presence or absence of an element or text substring on the current page.

Supported `mode` values:
- `contain-element` — returns `true` if the selector matches at least one element
- `not-contain-element` — returns `true` if no element matches the selector
- `contain-text` — returns `true` if the page HTML contains the text
- `not-contain-text` — returns `true` if the page HTML does not contain the text

**Returns:** `true` if the condition is met, `false` otherwise.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selectorType` | string |  | — | Selector strategy used for the assertion. |
| `mode` | `contain-element` \| `not-contain-element` \| `contain-text` \| `not-contain-text` | ✓ | — | Assertion mode: contain-element, not-contain-element, contain-text, or not-contain-text. |
| `value` | string | ✓ | — | Selector or text to assert the presence or absence of. |

```yaml
# Check whether a welcome message is visible after login
- group: browser
  name: contains
  params:
    browser: '{= browserInstance =}'
    mode: contain-text
    value: 'Welcome back'
  destination: hasWelcome
```

### `runJavaScript`

Executes a JavaScript snippet inside the page context, with optional variable bindings.

The `context` object is serialized and its keys are destructured into the script scope,
so values from the pipeline can be passed in without `eval` string interpolation.
The script must use `return` to produce a value.

**Returns:** Whatever value the script returns.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `script` | string | ✓ | — | JavaScript code to execute in the page context. |
| `context` | Record&lt;string, any&gt; |  | — | Optional variables to expose to the script. |

```yaml
# Collect all visible link hrefs from the page
- group: browser
  name: runJavaScript
  params:
    browser: '{= browserInstance =}'
    script: |
      const items = document.querySelectorAll('.item');
      return Array.from(items).map(el => el.textContent.trim());
  destination: itemTexts
```

### `takeScreenshot`

Captures a screenshot of the full page or visible viewport and saves it to disk.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `options` | object | ✓ | — | Screenshot options: path, fullPage, quality, and type (jpeg/png/webp). |

```yaml
# Save a full-page JPEG screenshot
- group: browser
  name: takeScreenshot
  params:
    browser: '{= browserInstance =}'
    options:
      path: /tmp/screenshot.jpg
      fullPage: true
      quality: 85
      type: jpeg
```

### `takeScreenshotElement`

Captures a screenshot of a single DOM element and saves it to disk.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the element to screenshot. |
| `selectorType` | string |  | "css" | Selector strategy (default css). |
| `options` | object | ✓ | — | Screenshot options: path, quality, and type (jpeg/png/webp). |

```yaml
# Screenshot just the hero banner element
- group: browser
  name: takeScreenshotElement
  params:
    browser: '{= browserInstance =}'
    selector: '.hero-banner'
    selectorType: css
    options:
      path: /tmp/banner.jpg
      quality: 85
      type: jpeg
```

### `startScreencast`

Starts recording the browser viewport to a video file. Store the returned recorder
in a variable and pass it to `stopScreencast` when done.

Note: screencast requires headful mode (`headless: false`) or the new Chromium
headless mode (`headless: 'shell'`) — the legacy headless mode disables the GPU
compositor, causing blank recordings.

**Returns:** The screencast recorder handle (pass to `stopScreencast`).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `options` | object | ✓ | — | Screencast options: path, quality (0–63), and format (gif/webm/mp4). |

```yaml
- group: browser
  name: startScreencast
  params:
    browser: '{= browserInstance =}'
    options:
      path: /tmp/recording.mp4
  destination: recorderInstance
```

### `stopScreencast`

Stops an active screencast recording and finalizes the output file.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `recorder` | any | ✓ | — | The recorder object returned by Start Screencast. |

```yaml
- group: browser
  name: stopScreencast
  params:
    browser: '{= browserInstance =}'
    recorder: '{= recorderInstance =}'
```

### `generatePDF`

Exports the current page to a PDF file.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `options` | object | ✓ | — | PDF options: path, format (e.g. A4), landscape, printBackground, margins, headers/footers. |

```yaml
# Export to A4 PDF with background colors preserved
- group: browser
  name: generatePDF
  params:
    browser: '{= browserInstance =}'
    options:
      path: /tmp/page.pdf
      format: A4
      printBackground: true
      landscape: false
```

### `wait`

Pauses execution until a condition is met.

Supported `type` values:
- `timeout` — wait a fixed number of milliseconds
- `selector` — wait until an element appears in the DOM
- `navigation` — wait until the page finishes navigating
- `networkidle` — wait until there are no pending network requests

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `type` | `timeout` \| `selector` \| `navigation` \| `networkidle` | ✓ | — | What to wait for: timeout, selector, navigation, or networkidle. |
| `timeout` | number |  | — | Maximum time to wait in milliseconds. |
| `selector` | string |  | — | CSS/XPath selector to wait for (when type is selector). |
| `selectorType` | string |  | — | Selector strategy for the selector. |

```yaml
# Wait 2 seconds before the next action
- group: browser
  name: wait
  params:
    browser: '{= browserInstance =}'
    type: timeout
    timeout: 2000
```

### `metadata`

Reads the `content` attribute of one or more `<meta name="…">` tags.

**Returns:** An array of `content` values from all matching meta tags.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `name` | string | ✓ | — | Name of the metadata attribute to retrieve (e.g. "description", "keywords"). |

```yaml
# Read the page's SEO description meta tag
- group: browser
  name: metadata
  params:
    browser: '{= browserInstance =}'
    name: description
  destination: metaDescription
```

### `addStyleTag`

Injects a CSS `<style>` tag into the page, overriding or extending existing styles.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `css` | any | ✓ | — | CSS string or style object to inject into the page. |

```yaml
# Inject CSS to highlight all links before taking a screenshot
- group: browser
  name: addStyleTag
  params:
    browser: '{= browserInstance =}'
    css: 'a { outline: 2px solid red; }'
```

### `getCookies`

Returns all cookies currently set in the browser.

**Returns:** An array of cookie objects.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to read cookies from. |

```yaml
- group: browser
  name: getCookies
  params:
    browser: '{= browserInstance =}'
  destination: allCookies
```

### `setCookies`

Sets one or more cookies in the browser.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `cookies` | object[] | ✓ | — | Array of cookie objects with name, value, and domain. |

```yaml
# Inject an auth session cookie before navigating to a protected page
- group: browser
  name: setCookies
  params:
    browser: '{= browserInstance =}'
    cookies:
      - name: session_id
        value: abc123xyz
        domain: example.com
```

### `deleteCookies`

Deletes one or more cookies from the browser.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `cookies` | object[] | ✓ | — | Array of cookie objects to delete. |

```yaml
- group: browser
  name: deleteCookies
  params:
    browser: '{= browserInstance =}'
    cookies:
      - name: session_id
        domain: example.com
        path: /
        value: abc123xyz
        expires: 9999999999
        size: 12
        httpOnly: false
        secure: false
        session: false
```

### `getViewport`

Returns the current viewport dimensions and device settings.

**Returns:** An object with `width`, `height`, `isMobile`, `isLandscape`, and `deviceScaleFactor`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to get the viewport from. |

```yaml
- group: browser
  name: getViewport
  params:
    browser: '{= browserInstance =}'
  destination: viewportInfo
```

### `setViewport`

Resizes the browser viewport to the given dimensions.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `width` | number | ✓ | — | Viewport width in pixels. |
| `height` | number | ✓ | — | Viewport height in pixels. |

```yaml
- group: browser
  name: setViewport
  params:
    browser: '{= browserInstance =}'
    width: 1440
    height: 900
```

### `keyboardType`

Types a string using the keyboard, optionally targeting a specific element first.
Supports a `delay` option to simulate human-speed typing.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `text` | string | ✓ | — | Text to type. |
| `selector` | string |  | — | Optional selector to focus before typing. |
| `selectorType` | string |  | — | Selector strategy for the optional selector. |
| `options` | object |  | — | Optional typing options (delay in ms between keystrokes). |

```yaml
# Type into a focused search field with a 100ms delay between keystrokes
- group: browser
  name: keyboardType
  params:
    browser: '{= browserInstance =}'
    selector: '#search-input'
    selectorType: css
    text: 'browser automation'
    options:
      delay: 100
```

### `keyboardDown`

Holds a keyboard key down (without releasing it). Pair with `keyboardUp` to release.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `key` | string | ✓ | — | Key name to press (e.g. "Enter", "ArrowLeft", "Shift"). |

```yaml
# Hold Shift down before pressing another key
- group: browser
  name: keyboardDown
  params:
    browser: '{= browserInstance =}'
    key: Shift
```

### `keyboardUp`

Releases a previously held keyboard key.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `key` | string | ✓ | — | Key name to release. |

```yaml
- group: browser
  name: keyboardUp
  params:
    browser: '{= browserInstance =}'
    key: Shift
```

### `keyboardPress`

Presses and immediately releases a keyboard key.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `key` | string | ✓ | — | Key name to press (press and release). |

```yaml
# Press Enter to submit a form
- group: browser
  name: keyboardPress
  params:
    browser: '{= browserInstance =}'
    key: Enter
```

### `keyboardSendCharacter`

Dispatches a single character as a key event. Unlike `keyboardType`, this does not
send key-down/key-up events — use it for special characters that require it.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `char` | string | ✓ | — | A single character to dispatch as a keyboard event. |

```yaml
- group: browser
  name: keyboardSendCharacter
  params:
    browser: '{= browserInstance =}'
    char: '@'
```

### `mouseClick`

Clicks at an absolute X/Y coordinate on the page.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `x` | number | ✓ | — | Horizontal page coordinate to click. |
| `y` | number | ✓ | — | Vertical page coordinate to click. |
| `options` | object |  | — | Click options: button (left/right/middle), count, and delay. |

```yaml
# Double-click at coordinate (640, 360)
- group: browser
  name: mouseClick
  params:
    browser: '{= browserInstance =}'
    x: 640
    y: 360
    options:
      button: left
      count: 2
      delay: 50
```

### `mouseDown`

Presses and holds a mouse button at the current cursor position.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `options` | object |  | — | Optional button to press down: left, right, or middle. |

```yaml
- group: browser
  name: mouseDown
  params:
    browser: '{= browserInstance =}'
    options:
      button: left
```

### `mouseUp`

Releases a previously held mouse button.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `options` | object |  | — | Optional button to release: left, right, or middle. |

```yaml
- group: browser
  name: mouseUp
  params:
    browser: '{= browserInstance =}'
    options:
      button: left
```

### `mouseMove`

Moves the mouse cursor to an absolute X/Y coordinate on the page.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `x` | number | ✓ | — | Target horizontal page coordinate. |
| `y` | number | ✓ | — | Target vertical page coordinate. |
| `options` | object |  | — | Optional steps for smooth movement. |

```yaml
- group: browser
  name: mouseMove
  params:
    browser: '{= browserInstance =}'
    x: 200
    y: 400
    options:
      steps: 5
```

### `mouseWheel`

Scrolls the page by simulating a mouse wheel event.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `options` | object |  | — | Scroll deltas: deltaX (horizontal) and deltaY (vertical) in pixels. |

```yaml
# Scroll down 500px vertically
- group: browser
  name: mouseWheel
  params:
    browser: '{= browserInstance =}'
    options:
      deltaX: 0
      deltaY: 500
```

### `dragAndDropByCoordinates`

Drags from one set of page coordinates to another, simulating a slow mouse drag.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `start` | object | ✓ | — | Starting coordinates {x, y} for the drag. |
| `target` | object | ✓ | — | Target coordinates {x, y} to drop at. |
| `steps` | number |  | — | Number of intermediate steps for smooth dragging. |

```yaml
- group: browser
  name: dragAndDropByCoordinates
  params:
    browser: '{= browserInstance =}'
    start:
      x: 100
      y: 200
    target:
      x: 400
      y: 200
    steps: 20
```

### `dragAndDropByElements`

Drags one DOM element onto another by resolving their bounding boxes first.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `sourceSelector` | string | ✓ | — | Selector for the element to drag. |
| `targetSelector` | string | ✓ | — | Selector for the element to drop onto. |
| `selectorType` | `css` \| `xpath` \| `text` \| `aria` |  | — | Selector strategy: css, xpath, text, or aria. |
| `steps` | number |  | — | Number of intermediate steps for smooth dragging. |

```yaml
- group: browser
  name: dragAndDropByElements
  params:
    browser: '{= browserInstance =}'
    sourceSelector: '.draggable-card'
    targetSelector: '.drop-zone'
    selectorType: css
    steps: 15
```

### `uploadFile`

Uploads one or more files to a `<input type="file">` element. File paths must be absolute.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `selector` | string | ✓ | — | Selector for the file input element. |
| `selectorType` | `css` \| `xpath` \| `text` \| `aria` |  | — | Selector strategy: css, xpath, text, or aria. |
| `filePaths` | string[] | ✓ | — | Array of local file paths to upload. |

```yaml
- group: browser
  name: uploadFile
  params:
    browser: '{= browserInstance =}'
    selector: '#file-input'
    selectorType: css
    filePaths:
      - /tmp/document.pdf
      - /tmp/attachment.zip
```

### `downloadFile`

Clicks a download link and waits for the file to finish downloading to `path`.
The `path` must be a directory — the browser uses the server-suggested filename.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `path` | string | ✓ | — | Local directory path to save the downloaded file. |
| `selector` | string | ✓ | — | Selector for the element that triggers the download. |
| `selectorType` | `css` \| `xpath` \| `text` \| `aria` |  | — | Selector strategy: css, xpath, text, or aria. |

```yaml
- group: browser
  name: downloadFile
  params:
    browser: '{= browserInstance =}'
    selector: 'a.download-link'
    selectorType: css
    path: /tmp/downloads/
```

### `runLighthouseAudit`

Runs a Lighthouse audit against a URL, reusing the given browser's debugging session.

`categories` selects which Lighthouse category groups to run — `performance`,
`accessibility`, `best-practices`, `seo` — each of which bundles many individual audits
(e.g. `performance` includes `uses-long-cache-ttl`, `server-response-time`,
`render-blocking-resources`). Individual audits cannot be selected on their own; they
come along with whichever category they belong to. Omit `categories` to run all of them.

Stack packs are not selectable — Lighthouse auto-detects the audited page's tech stack
(Drupal, WordPress, Magento, Next.js, etc.) and, when it recognizes one, attaches
stack-specific advice per audit id to `stackPacks`. If the URL isn't actually running a
recognized stack, `stackPacks` comes back empty regardless of `categories`.

**Returns:** An object with `categories` (scores per category), `audits` (every audit's
result, keyed by audit id), and `stackPacks` (auto-detected stack-specific advice, if any).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance to audit against (its debugging port is reused). |
| `url` | string | ✓ | — | URL to audit. |
| `categories` | `performance` \| `accessibility` \| `best-practices` \| `seo`[] |  | — | Which Lighthouse categories to run: performance, accessibility, best-practices, seo. Defaults to all. Each category bundles many individual audits (e.g. performance includes uses-long-cache-ttl, server-response-time) — you cannot select a single audit directly, only the category it belongs to. |

```yaml
# Audit only performance and best-practices
- group: browser
  name: runLighthouseAudit
  params:
    browser: '{= browserInstance =}'
    url: 'https://example.com'
    categories:
      - performance
      - best-practices
  destination: audit
# audit.categories.performance.score, audit.audits['uses-long-cache-ttl'], ...
# audit.stackPacks[0].descriptions['render-blocking-resources'] (e.g. Drupal-specific advice)
```

### `startHarCapture`

Begins recording a HAR (HTTP Archive) capture — every request/response on the page,
including sub-resources like CSS, JS, images, and CDN-hosted assets, not just the
top-level document, with headers, per-resource timing, cache status, and cookies.
Response bodies are not captured. Pass the returned id to `stopHarCapture` to build
and retrieve the HAR.

The live CDP session and its listeners are kept in an in-memory registry, not in the
returned value — pipeline variables get streamed over IPC and persisted to disk, both
of which require plain, structured-cloneable data, and a raw CDPSession/callback isn't.

**Returns:** A capture id (pass to `stopHarCapture`).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |

```yaml
- group: browser
  name: startHarCapture
  params:
    browser: '{= browserInstance =}'
  destination: captureId
```

### `stopHarCapture`

Stops a capture started by `startHarCapture`, builds the HAR (HTTP Archive) object from
the recorded CDP events via `chrome-har`, and returns it. `log.entries[]` holds one item
per request/response — `entries[].response.headers` is where to check cache/CDN headers,
`entries[].timings` has the DNS/connect/SSL/wait/receive breakdown per resource.

**Returns:** The HAR object. Also written to `path` if provided.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `browser` | any | ✓ | — | The browser instance. |
| `capture` | string | ✓ | — | The capture id returned by Start HAR Capture. |
| `path` | string |  | — | Optional local file path to also write the HAR JSON to. |

```yaml
- group: browser
  name: stopHarCapture
  params:
    browser: '{= browserInstance =}'
    capture: '{= captureId =}'
    path: /tmp/capture.har
  destination: har
```
