<script setup lang="ts">
import { displayBopomofo, type PaddingUnit } from "#shared/utils/schema";
import { computed } from "vue";

export interface AlignmentCell {
  character: string;
  options: PaddingUnit[];
  selected: PaddingUnit[];
}

const props = defineProps<{ cells: AlignmentCell[]; multiple?: boolean }>();
const emit = defineEmits<{
  change: [index: number, readings: PaddingUnit[]];
}>();

const unresolvedCount = computed(
  () => props.cells.filter((cell) => !cell.selected.length).length,
);

function keyOf(reading: PaddingUnit): string {
  return `${reading.syllable}:${reading.tone}`;
}

function isSelected(cell: AlignmentCell, reading: PaddingUnit): boolean {
  return cell.selected.some((option) => keyOf(option) === keyOf(reading));
}

function toggle(index: number, reading: PaddingUnit) {
  const cell = props.cells[index];
  if (!cell) return;
  if (!props.multiple) emit("change", index, [reading]);
  else if (isSelected(cell, reading)) {
    emit("change", index, cell.selected.filter((option) => keyOf(option) !== keyOf(reading)));
  } else emit("change", index, [...cell.selected, reading]);
}
</script>

<template>
  <div v-if="cells.length" class="alignment-region">
    <div v-if="unresolvedCount" class="alignment-summary" aria-live="polite">
      <span class="needs-action">還有 {{ unresolvedCount }} 字待確認</span>
    </div>

    <div class="alignment-track">
      <article
        v-for="(cell, index) in cells"
        :key="`${index}-${cell.character}`"
        class="alignment-card"
        :class="{
          unresolved: !cell.selected.length,
          unsupported: cell.options.length === 0,
        }"
      >
        <strong class="answer-character">{{ cell.character }}</strong>

        <span v-if="cell.options.length === 0" class="reading-placeholder">不支援此字</span>

        <span v-else-if="cell.options.length === 1" class="reading-value">
          {{ displayBopomofo(cell.options[0]!) }}
        </span>

        <div
          v-else
          class="reading-choices"
          :role="multiple ? 'group' : 'radiogroup'"
          :aria-label="`第 ${index + 1} 字 ${cell.character} 的讀音`"
        >
          <button
            v-for="option in cell.options"
            :key="keyOf(option)"
            type="button"
            class="reading-choice"
            :class="{ selected: isSelected(cell, option) }"
            :role="multiple ? undefined : 'radio'"
            :aria-pressed="multiple ? isSelected(cell, option) : undefined"
            :aria-checked="multiple ? undefined : isSelected(cell, option)"
            @click="toggle(index, option)"
          >
            {{ displayBopomofo(option) }}
          </button>
        </div>
      </article>
    </div>
  </div>

  <div v-else class="alignment-empty">
    <span class="empty-glyph">ㄅ</span>
    <strong>先輸入{{ multiple ? "要標註的文字" : "正確答案" }}</strong>
  </div>
</template>
