<script setup lang="ts">
import type { Difficulty } from "#shared/utils/schema";

defineProps<{ modelValue: Difficulty | null }>();
const emit = defineEmits<{ "update:modelValue": [value: Difficulty] }>();

const levels: Array<{
  value: Difficulty;
  label: string;
  description: string;
}> = [
  { value: 1, label: "容易", description: "語境明確，詞彙常見" },
  { value: 2, label: "略有難度", description: "稍有歧義，或詞彙較少見" },
  { value: 3, label: "中等", description: "需權衡少數答案，或具備背景知識" },
  { value: 4, label: "困難", description: "多個答案合理，或含罕見、專業詞彙" },
  { value: 5, label: "極困難", description: "僅憑語境難以判斷，或需高度專門知識" },
];
</script>

<template>
  <div class="difficulty-grid" role="radiogroup" aria-label="整體判讀難度">
    <button
      v-for="level in levels"
      :key="level.value"
      type="button"
      class="difficulty-option"
      :class="{ selected: modelValue === level.value }"
      role="radio"
      :aria-checked="modelValue === level.value"
      @click="emit('update:modelValue', level.value)"
    >
      <span class="difficulty-number">{{ level.value }}</span>
      <strong>{{ level.label }}</strong>
      <small>{{ level.description }}</small>
    </button>
  </div>
</template>
