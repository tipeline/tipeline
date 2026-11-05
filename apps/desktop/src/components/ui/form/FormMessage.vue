<script lang="ts" setup>
import type { HTMLAttributes } from "vue"
import { ErrorMessage } from "vee-validate"
import { toValue } from "vue"
import { cn } from "@/lib/utils"
import { useFormField } from "./useFormField"
import { useLocale } from "@/composables/useLocale"
import { getValidationDictionary } from "@/utils/validationDictionary"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()

const { name, formMessageId } = useFormField()
const { currentLocale } = useLocale()

// Zod schema messages are sometimes a translation key (e.g. "task.version.invalid")
// and sometimes still literal English prose. Either way, a recognized key gets
// translated; anything else passes through unchanged.
function translateMessage(message: string | undefined): string {
  if (!message) return ""
  const dictionary = getValidationDictionary(currentLocale.value)
  return dictionary[message.trim()] ?? message
}
</script>

<template>
  <ErrorMessage
    :id="formMessageId"
    data-slot="form-message"
    as="p"
    :name="toValue(name)"
    :class="cn('text-destructive text-sm', props.class)"
    v-slot="{ message }"
  >
    {{ translateMessage(message) }}
  </ErrorMessage>
</template>
