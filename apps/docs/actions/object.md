<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Object Actions

## General

### `parse`

Parses a JSON string into an object.

**Returns:** The parsed object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `text` | string | ✓ | — | JSON string to parse into an object. |

```yaml
# Deserialize an API response body stored as a string into a workable object
- group: object
  name: parse
  params:
    text: '{{ responseBody }}'
```

## Parsing

### `setProperty`

Sets a nested property on an object using a dot or bracket path.

**Returns:** The mutated object with the property set.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The object to modify. |
| `property` | string | ✓ | — | Dot or bracket path to the property (e.g. "user.name" or "items[0].id"). |
| `value` | any | ✓ | — | Value to set at the property path. |

```yaml
# Update the retry count inside a nested config object
- group: object
  name: setProperty
  params:
    object: '{= config =}'
    property: 'connection.retries'
    value: 5
```

## Property

### `hasProperty`

Checks if a property exists in an object, supporting nested dot paths.

**Returns:** `true` if the property exists, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The object to inspect. |
| `property` | string | ✓ | — | Dot or bracket path to the property to check (e.g. "user.address.city"). |

```yaml
# Check whether the config has a nested auth token before making an API call
- group: object
  name: hasProperty
  params:
    object: '{= config =}'
    property: 'auth.token'
```

### `getProperty`

Gets a nested property value from an object, with an optional fallback.

**Returns:** The property value, or `defaultValue` if the path is not found.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The object to read from. |
| `property` | string | ✓ | — | Dot or bracket path to the property (e.g. "user.name"). |
| `defaultValue` | any |  | — | Value to return if the property does not exist. |

```yaml
# Read a nested setting from a user profile, falling back to 'en' if unset
- group: object
  name: getProperty
  params:
    object: '{= userProfile =}'
    property: 'settings.language'
    defaultValue: en
```

### `keys`

Returns all top-level keys from an object.

**Returns:** An array of key strings, or an empty array if the input is invalid.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The object to extract keys from. |

```yaml
# List the top-level fields of a parsed API response for dynamic iteration
- group: object
  name: keys
  params:
    object: '{= responseData =}'
```

## Inspection

### `values`

Returns all top-level values from an object.

**Returns:** An array of values, or an empty array if the input is invalid.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The object to extract values from. |

```yaml
# Extract all config values for bulk validation before a pipeline run
- group: object
  name: values
  params:
    object: '{= config =}'
```

### `entries`

Returns all key-value pairs from an object as an array of `[key, value]` entries.

**Returns:** An array of `[key, value]` tuples, or an empty array if the input is invalid.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The object to get entries from. |

```yaml
# Get all entries from a config object for dynamic iteration over key-value pairs
- group: object
  name: entries
  params:
    object: '{= config =}'
```

### `merge`

Deep-merges multiple objects into a single object.

Later objects in the list override earlier ones at each nested level.

**Returns:** The merged object, or `{}` if the input list is empty.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `objects` | Record&lt;string, any&gt;[] | ✓ | — | Array of objects to deep-merge (later entries override earlier ones). |

```yaml
# Merge default config with environment-specific overrides before running a task
- group: object
  name: merge
  params:
    objects:
      - '{= defaultConfig =}'
      - '{= overrides =}'
```

## Transform

### `pick`

Picks a subset of properties from an object by name.

**Returns:** A new object containing only the specified properties.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The source object to pick from. |
| `properties` | string[] | ✓ | — | List of property keys to include in the result. |

```yaml
# Extract only the fields needed before forwarding to an external API
- group: object
  name: pick
  params:
    object: '{= userProfile =}'
    properties:
      - name
      - email
```

### `omit`

Returns a copy of an object with the specified properties removed.

**Returns:** A new object without the omitted properties.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The source object to omit from. |
| `properties` | string[] | ✓ | — | List of property keys to exclude from the result. |

```yaml
# Strip internal tracking fields before logging a pipeline result
- group: object
  name: omit
  params:
    object: '{= pipelineResult =}'
    properties:
      - _id
      - _createdAt
```

### `deleteProperty`

Deletes a nested property from an object using a dot or bracket path.

**Returns:** The mutated object with the property removed.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The object to delete a property from. |
| `property` | string | ✓ | — | Dot or bracket path of the property to delete (e.g. "user.address"). |

```yaml
# Remove a nested auth token from the config before passing it to a logger
- group: object
  name: deleteProperty
  params:
    object: '{= config =}'
    property: 'auth.token'
```

### `clone`

Creates a deep copy of an object.

**Returns:** A new object that is a deep clone of the input.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | The object to deep-clone. |

```yaml
# Clone the shared config before mutating it for a specific pipeline branch
- group: object
  name: clone
  params:
    object: '{= config =}'
```
