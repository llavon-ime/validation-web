<script setup lang="ts">
import { displayBopomofo, type PaddingUnit } from "#shared/utils/schema";
import { computed } from "vue";

export interface AlignmentCell {
  character: string;
  options: PaddingUnit[];
  selected: PaddingUnit | null;
}

const props = defineProps<{ cells: AlignmentCell[] }>();
const emit = defineEmits<{
  select: [index: number, reading: PaddingUnit];
}>();

const unresolvedCount = computed(
  () => props.cells.filter((cell) => !cell.selected).length,
);

function keyOf(reading: PaddingUnit | null): string {
  return reading ? `${reading.syllable}:${reading.tone}` : "";
}

function onSelect(index: number, event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  const reading = props.cells[index]?.options.find(
    (option) => keyOf(option) === value,
  );
  if (reading) emit("select", index, reading);
}
</script>

<template>
  <div v-if="cells.length" class="alignment-region">
    <div class="alignment-summary" aria-live="polite">
      <span>答案與讀音一字一格</span>
      <span v-if="unresolvedCount" class="needs-action">
        還有 {{ unresolvedCount }} 格需要確認
      </span>
      <span v-else class="ready-state">讀音對齊完成</span>
    </div>

    <div class="alignment-track">
      <article
        v-for="(cell, index) in cells"
        :key="`${index}-${cell.character}`"
        class="alignment-card"
        :class="{
          unresolved: !cell.selected,
          unsupported: cell.options.length === 0,
        }"
      >
        <span class="position-label">第 {{ index + 1 }} 字</span>
        <strong class="answer-character">{{ cell.character }}</strong>

        <template v-if="cell.options.length === 0">
          <span class="reading-placeholder">無可用讀音</span>
          <small>目前模型的候選表不支援這個字</small>
        </template>

        <template v-else-if="cell.options.length === 1 && cell.selected">
          <span class="reading-value">{{ displayBopomofo(cell.selected) }}</span>
          <small>已由候選表自動匹配</small>
        </template>

        <template v-else>
          <label :for="`reading-${index}`">選擇這個字的讀音</label>
          <select
            :id="`reading-${index}`"
            :value="keyOf(cell.selected)"
            @change="onSelect(index, $event)"
          >
            <option value="" disabled>請選擇</option>
            <option
              v-for="option in cell.options"
              :key="keyOf(option)"
              :value="keyOf(option)"
            >
              {{ displayBopomofo(option) }}
            </option>
          </select>
          <small>這是破音字，請依照前文判斷</small>
        </template>
      </article>
    </div>
  </div>

  <div v-else class="alignment-empty">
    <span class="empty-glyph">ㄅ</span>
    <div>
      <strong>輸入正確答案後，讀音會出現在這裡</strong>
      <p>單一讀音自動完成；遇到破音字時再由你選擇。</p>
    </div>
  </div>
</template>
