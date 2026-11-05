<script setup lang="ts">
import type { SliderRootEmits, SliderRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<SliderRootProps & { class?: HTMLAttributes["class"]; thumbLabels?: string[] }>()

const emits = defineEmits<SliderRootEmits>()

const delegatedProps = reactiveOmit(props, "class", "thumbLabels")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SliderRoot
    data-slot="slider"
    v-bind="forwarded"
    :class="cn(
      'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
      props.class,
    )"
  >
    <SliderTrack
      data-slot="slider-track"
      class="bg-muted relative grow overflow-hidden rounded-full h-1.5 w-full"
    >
      <SliderRange data-slot="slider-range" class="bg-primary absolute h-full" />
    </SliderTrack>
    <SliderThumb
      v-for="(_, key) in modelValue ?? defaultValue ?? [0]"
      :key="key"
      data-slot="slider-thumb"
      :aria-label="thumbLabels?.[key]"
      class="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderRoot>
</template>
