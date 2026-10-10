<script setup lang="ts">
import { ref, watch } from "vue";
import { PaddingUnitSchema, displayBopomofo, type PaddingUnit } from "#shared/utils/schema";
import { getReadingsForCharacter } from "#shared/utils/zhuyin";
import { PRONUNCIATION_LIMITS } from "#shared/utils/pronunciation";
const props = defineProps<{ characters: string[]; readings: PaddingUnit[][] }>();
const emit = defineEmits<{ change: [index: number, readings: PaddingUnit[]] }>();
const custom = ref<Record<number, string>>({});
const tones = ref<Record<number, number>>({});
const errors = ref<Record<number, string>>({});
watch(() => props.characters, (characters, previous) => {
  for (let i = 0; i < previous.length; i += 1) {
    if (characters[i] !== previous[i]) {
      delete custom.value[i];
      delete tones.value[i];
      delete errors.value[i];
    }
  }
});
const keyOf = (r: PaddingUnit) => `${r.syllable}:${r.tone}`;
function options(index: number) {
  const all = [...getReadingsForCharacter(props.characters[index]!), ...(props.readings[index] ?? [])];
  return [...new Map(all.map(r => [keyOf(r), r])).values()];
}
function selected(index: number, reading: PaddingUnit) {
  return props.readings[index]?.some(r => keyOf(r) === keyOf(reading)) ?? false;
}
function toggle(index: number, reading: PaddingUnit) {
  errors.value[index] = "";
  const rows = props.readings[index] ?? [];
  if (selected(index, reading)) emit("change", index, rows.filter(r => keyOf(r) !== keyOf(reading)));
  else if (rows.length < PRONUNCIATION_LIMITS.alternatives) emit("change", index, [...rows, reading]);
  else errors.value[index] = `每個字最多 ${PRONUNCIATION_LIMITS.alternatives} 個讀音`;
}
function add(index: number) {
  let syllable = (custom.value[index] ?? "").trim().normalize("NFC");
  let tone = tones.value[index] ?? 1;
  const marks: Record<string, number> = { "ˉ": 1, "ˊ": 2, "ˇ": 3, "ˋ": 4, "˙": 5 };
  if (marks[syllable.at(-1) ?? ""]) { tone = marks[syllable.at(-1)!]!; syllable = syllable.slice(0, -1); }
  else if (syllable.startsWith("˙")) { tone = 5; syllable = syllable.slice(1); }
  const parsed = PaddingUnitSchema.safeParse({ syllable, tone });
  if (!parsed.success || !/^[ㄅ-ㄩ]+$/u.test(syllable)) { errors.value[index] = "請輸入一個注音音節，例如 ㄕㄨ；可直接附聲調"; return; }
  if (selected(index, parsed.data)) { errors.value[index] = "這個讀音已經選取"; return; }
  toggle(index, parsed.data);
  if (!errors.value[index]) custom.value[index] = "";
}
</script>

<template>
  <div v-if="!characters.length" class="alignment-empty"><span class="empty-glyph">ㄕ</span><strong>先輸入要標註的文字</strong></div>
  <div v-else class="multi-alignment">
    <article v-for="(character, index) in characters" :key="`${index}-${character}`" class="multi-reading-card">
      <div class="multi-character"><strong class="answer-character">{{ character }}</strong></div>
      <div class="multi-options">
        <div class="reading-choices" role="group" :aria-label="`第 ${index + 1} 字 ${character} 的可接受讀音`">
          <button v-for="option in options(index)" :key="keyOf(option)" type="button" class="reading-choice" :class="{ selected: selected(index, option) }" :aria-pressed="selected(index, option)" @click="toggle(index, option)">{{ displayBopomofo(option) }}<span v-if="selected(index, option)" aria-hidden="true"> ✓</span></button>
        </div>
        <div class="custom-reading-row">
          <input v-model="custom[index]" :aria-label="`第 ${index + 1} 字的自訂注音`" placeholder="其他讀音，如 ㄕㄨ" maxlength="5" @keydown.enter.prevent="add(index)" />
          <select v-model.number="tones[index]" :aria-label="`第 ${index + 1} 字的聲調`"><option :value="undefined">一聲 ˉ</option><option :value="2">二聲 ˊ</option><option :value="3">三聲 ˇ</option><option :value="4">四聲 ˋ</option><option :value="5">輕聲 ˙</option></select>
          <button type="button" class="add-reading" @click="add(index)">新增</button>
        </div>
        <p v-if="errors[index]" class="reading-error" role="alert">{{ errors[index] }}</p>
      </div>
    </article>
  </div>
</template>
