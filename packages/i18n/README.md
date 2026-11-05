# @tipeline/i18n

Shared translations for Tipeline applications (CLI, Desktop, etc.).

## Usage

```ts
import { createI18n } from '@tipeline/i18n';

const i18n = createI18n('es');
console.log(i18n.t('step.group.required')); // → El grupo es obligatorio
