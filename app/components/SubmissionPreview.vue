<script setup lang="ts">
import { displayBopomofo, type PaddingUnit } from "#shared/utils/schema";
import { computed } from "vue";

interface PreviewCell {
  character: string;
  selected: PaddingUnit | null;
}

const props = defineProps<{
  context: string;
  cells: PreviewCell[];
}>();

const hasContent = computed(
  () => props.context.length > 0 || props.cells.length > 0,
);
const isComplete = computed(
  () =>
    props.cells.length > 0 &&
    props.cells.every((cell) => cell.selected !== null),
);
const readingSequence = computed(() =>
  props.cells
    .map((cell) =>
      cell.selected ? displayBopomofo(cell.selected) : "尚未選擇",
    )
    .join("　"),
);
</script>

<template>
  <section class="submission-preview" aria-labelledby="preview-title">
    <div class="preview-header">
      <div>
        <span class="preview-kicker">PREVIEW</span>
        <h3 id="preview-title">提交預覽</h3>
      </div>
      <span
        class="preview-status"
        :class="{ complete: isComplete }"
        aria-live="polite"
      >
        {{ isComplete ? "已完整對齊" : "內容尚未完成" }}
      </span>
    </div>

    <div v-if="hasContent" class="preview-surface">
      <p class="composed-sentence">
        <span v-if="context" class="preview-context">{{ context }}</span>
        <span v-if="cells.length" class="preview-answer">
          <ruby v-for="(cell, index) in cells" :key="`${index}-${cell.character}`">
            <span>{{ cell.character }}</span>
            <rt :class="{ unresolved: !cell.selected }">
              {{ cell.selected ? displayBopomofo(cell.selected) : "待選" }}
            </rt>
          </ruby>
        </span>
        <span v-else class="preview-answer-placeholder">正確答案</span>
      </p>

      <div class="preview-reading-row">
        <span>逐字注音</span>
        <strong>{{ readingSequence || "等待正確答案" }}</strong>
      </div>
    </div>

    <div v-else class="preview-empty">
      <span aria-hidden="true">字</span>
      <p>
        <strong>完整句子會顯示在這裡</strong>
        填入正確答案後，可在送出前確認組字與逐字注音。
      </p>
    </div>
  </section>
</template>
