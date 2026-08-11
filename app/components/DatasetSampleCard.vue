<script setup lang="ts">
import {
  displayBopomofo,
  type Difficulty,
  type StoredValidationSample,
} from "#shared/utils/schema";
import { computed } from "vue";

const props = defineProps<{
  sample: StoredValidationSample;
  number: number;
}>();

const answerCells = computed(() =>
  Array.from(props.sample.answer.normalize("NFC")).map((character, index) => ({
    character,
    reading: props.sample.padding[index]!,
  })),
);

const difficultyLabels: Record<Difficulty, string> = {
  1: "容易",
  2: "略有難度",
  3: "中等",
  4: "困難",
  5: "極困難",
};
</script>

<template>
  <article class="dataset-sample-card">
    <header class="dataset-card-header">
      <span>樣本 #{{ number.toLocaleString() }}</span>
      <span class="dataset-difficulty">
        難度 {{ sample.difficulty }}・{{ difficultyLabels[sample.difficulty] }}
      </span>
    </header>

    <div class="dataset-card-body">
      <p class="composed-sentence dataset-sentence">
        <span class="preview-context">{{ sample.context }}</span>
        <span class="preview-answer">
          <ruby v-for="(cell, index) in answerCells" :key="`${index}-${cell.character}`">
            <span>{{ cell.character }}</span>
            <rt>{{ displayBopomofo(cell.reading) }}</rt>
          </ruby>
        </span>
      </p>

      <div class="preview-reading-row">
        <span>逐字注音</span>
        <strong>
          {{ sample.padding.map((reading) => displayBopomofo(reading)).join("　") }}
        </strong>
      </div>
    </div>
  </article>
</template>
