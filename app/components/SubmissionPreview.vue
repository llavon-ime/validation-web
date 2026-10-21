<script setup lang="ts">
import { displayBopomofo } from "#shared/utils/schema";
import type { AlignmentCell } from "./ZhuyinAligner.vue";

defineProps<{
  context: string;
  cells: AlignmentCell[];
}>();
</script>

<template>
  <section class="submission-preview" aria-label="提交預覽">
    <div class="preview-surface">
      <p class="composed-sentence">
        <span v-if="context" class="preview-context">{{ context }}</span>
        <span v-if="cells.length" class="preview-answer">
          <ruby v-for="(cell, index) in cells" :key="`${index}-${cell.character}`">
            <span>{{ cell.character }}</span>
            <rt :class="{ unresolved: !cell.selected[0] }">
              {{ cell.selected[0] ? displayBopomofo(cell.selected[0]) : "待選" }}
            </rt>
          </ruby>
        </span>
      </p>
    </div>
  </section>
</template>
