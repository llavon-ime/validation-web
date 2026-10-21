<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { z } from "zod";
import { CONTRIBUTION_AGREEMENT_VERSION, DATASET_LICENSE, PaddingUnitSchema, displayBopomofo, type PaddingUnit, type SubmissionResponse } from "#shared/utils/schema";
import { PronunciationDraftSchema, PronunciationSampleSchema } from "#shared/utils/pronunciation";
import { getReadingsForCharacter } from "#shared/utils/zhuyin";
import { acceptContributionAgreement, getContributionAgreement, submitPronunciationSample } from "../utils/api";
import ContributionAgreement from "../components/ContributionAgreement.vue";
import ZhuyinAligner from "../components/ZhuyinAligner.vue";
useHead({ title: "人工多讀音標註・拉風輸入法" });
const DRAFT_KEY = "llavon-pronunciation-draft-v1";
const answer = ref("");
const description = ref("");
const readings = ref<PaddingUnit[][]>([]);
const consent = ref(false);
const trainingConsent = ref(false);
const credit = ref(true);
const submissionId = ref("");
const storageReady = ref(false);
const storageWarning = ref("");
const errorMessage = ref("");
const result = ref<SubmissionResponse | null>(null);
const submitting = ref(false);
const review = ref<HTMLDialogElement | null>(null);
const agreementAcceptedAt = ref<string | null>(null);
const agreementReady = ref(false);
const agreementLoading = ref(false);
const agreementError = ref("");
const { user, ready: sessionReady, clear: signOut } = useUserSession();
const route = useRoute();
const characters = computed(() => Array.from(answer.value.normalize("NFC")));
const cells = computed(() => characters.value.map((character, index) => ({ character,
  options: getReadingsForCharacter(character), selected: readings.value[index] ?? [] })));
const sample = computed(() => ({ schemaVersion: 1 as const, license: DATASET_LICENSE, kind: "pronunciation" as const,
  answer: answer.value.normalize("NFC"),
  readings: readings.value, description: description.value.normalize("NFC") }));
const draft = computed(() => PronunciationDraftSchema.safeParse({ submissionId: submissionId.value, sample: sample.value,
  publicContributionConsent: consent.value, trainingUseConsent: trainingConsent.value, creditAsCoauthor: credit.value }));
const sampleValidation = computed(() => PronunciationSampleSchema.safeParse(sample.value));
const savedSchema = z.object({ submissionId: z.uuid(), answer: z.string(), description: z.string(),
  readings: z.array(z.array(PaddingUnitSchema)), consent: z.boolean(), trainingConsent: z.boolean(), credit: z.boolean() });
watch(answer, (value, old) => {
  const previous = Array.from(old.normalize("NFC"));
  readings.value = Array.from(value.normalize("NFC")).map((character, index) => {
    if (previous[index] === character) return readings.value[index] ?? [];
    const options = getReadingsForCharacter(character);
    return options.length === 1 ? options : [];
  });
}, { flush: "sync" });
function saveDraft() {
  if (!storageReady.value) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ submissionId: submissionId.value,
      answer: answer.value, description: description.value, readings: readings.value,
      consent: consent.value, trainingConsent: trainingConsent.value, credit: credit.value }));
  } catch { storageWarning.value = "瀏覽器無法保存草稿，離開前請先完成提交。"; }
}
watch([answer, description, readings, consent, trainingConsent, credit], () => { result.value = null; saveDraft(); }, { deep: true });
function preview() {
  errorMessage.value = "";
  if (!draft.value.success) { errorMessage.value = draft.value.error.issues[0]?.message ?? "請檢查欄位"; return; }
  saveDraft();
  review.value?.showModal();
}
async function submit() {
  if (!draft.value.success || submitting.value) return;
  if (!user.value) { saveDraft(); window.location.assign("/auth/github?returnTo=/pronunciations"); return; }
  if (!agreementAcceptedAt.value) { review.value?.close(); errorMessage.value = "請先接受貢獻同意書"; return; }
  const payload = draft.value.data;
  submitting.value = true;
  try {
    result.value = await submitPronunciationSample(payload);
    submissionId.value = crypto.randomUUID();
    review.value?.close();
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* Submission succeeded even if local storage is unavailable. */ }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "提交失敗，草稿已保留";
    review.value?.close();
  } finally { submitting.value = false; }
}
async function acceptAgreement() {
  agreementLoading.value = true;
  agreementError.value = "";
  try { agreementAcceptedAt.value = (await acceptContributionAgreement(CONTRIBUTION_AGREEMENT_VERSION)).agreement.acceptedAt; }
  catch (error) { agreementError.value = error instanceof Error ? error.message : "無法記錄同意"; }
  finally { agreementLoading.value = false; }
}
onMounted(async () => {
  submissionId.value = crypto.randomUUID();
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const saved = raw ? savedSchema.safeParse(JSON.parse(raw)) : null;
    if (saved?.success) {
      const s = saved.data;
      submissionId.value = s.submissionId; answer.value = s.answer;
      description.value = s.description; readings.value = s.readings;
      consent.value = s.consent; trainingConsent.value = s.trainingConsent; credit.value = s.credit;
    }
  } catch { storageWarning.value = "無法還原草稿，請重新填寫。"; }
  storageReady.value = true;
  if (route.query.auth === "failed") errorMessage.value = "GitHub 登入失敗，草稿仍保留，可重新登入。";
  try { agreementAcceptedAt.value = (await getContributionAgreement()).agreement.acceptedAt; }
  catch { agreementError.value = "無法讀取同意書狀態，請稍後重試。"; }
  finally { agreementReady.value = true; }
});
</script>

<template>
  <div class="site-shell">
    <header class="topbar">
      <NuxtLink class="brand" to="/"><img class="brand-logo" src="/llavon-logo.png" alt="拉風輸入法 Logo" /><span><strong>拉風輸入法</strong><small>驗證集共筆</small></span></NuxtLink>
      <div class="account-area">
        <NuxtLink class="dataset-link" to="/">驗證集投稿</NuxtLink><NuxtLink class="dataset-link active" to="/pronunciations">多讀音標註</NuxtLink><NuxtLink class="dataset-link" to="/dataset">瀏覽資料集</NuxtLink>
        <span v-if="!sessionReady" class="session-placeholder">確認登入狀態…</span>
        <template v-else-if="user"><a :href="user.profileUrl" class="user-chip" target="_blank" rel="noreferrer"><img :src="user.avatarUrl" alt="" /><span>@{{ user.githubLogin }}</span></a><button type="button" class="text-button" @click="signOut">登出</button></template>
        <a v-else class="github-button compact" href="/auth/github?returnTo=/pronunciations">使用 GitHub 登入</a>
      </div>
    </header>
    <main class="page-content">
      <section class="page-heading"><h1>人工多讀音標註</h1></section>
      <section class="form-card" aria-label="多讀音標註表單">
        <form @submit.prevent="preview">
          <div class="field-group"><div class="field-label-row"><label for="p-answer"><span class="field-index">1</span>標註文字</label></div><input id="p-answer" v-model="answer" type="text" placeholder="例如：部署" required autocomplete="off" /></div>
          <div class="field-group"><div class="field-label-row"><span class="field-label"><span class="field-index">2</span>可接受的讀音</span></div><ZhuyinAligner :cells="cells" multiple @change="(index, values) => readings[index] = values" /></div>
          <div class="field-group"><div class="field-label-row"><label for="p-description"><span class="field-index">3</span>說明（選填）</label></div><textarea id="p-description" v-model="description" rows="4" placeholder="例如：署的四聲是日常口語讀法" /></div>
          <label class="consent-row"><input v-model="consent" type="checkbox" /><span>我確認內容可公開、不含私人或敏感資料，且我有權提交這些文字。</span></label>
          <label class="consent-row"><input v-model="trainingConsent" type="checkbox" /><span>我確認已選讀音在這筆資料中都可接受，並同意將本筆人工標註及說明依 CC BY 4.0 公開，用於模型訓練。</span></label>
          <label class="consent-row attribution-row"><input v-model="credit" type="checkbox" /><span><strong>（可選）在 GitHub commit 列為共同作者</strong></span></label>
          <p v-if="storageWarning" class="field-hint" role="status">{{ storageWarning }}</p>
          <div v-if="errorMessage" class="message error-message" role="alert">{{ errorMessage }}</div>
          <div v-if="result" class="message success-message" role="status"><strong>標註已排入存檔</strong><a href="https://github.com/llavon-ime/validation-set/actions" target="_blank" rel="noreferrer">查看執行進度 ↗</a></div>
          <p v-if="answer && !sampleValidation.success" class="field-hint">{{ sampleValidation.error.issues[0]?.message }}</p>
          <button class="submit-button" type="submit" :disabled="!draft.success || submitting"><span>預覽提交內容</span><span aria-hidden="true">→</span></button>
        </form>
      </section>
    </main>
    <footer><span>llavon-ime / validation-web</span></footer>
    <ContributionAgreement :open="agreementReady && !agreementAcceptedAt" :version="CONTRIBUTION_AGREEMENT_VERSION" :loading="agreementLoading" :error="agreementError" @accept="acceptAgreement" />
    <dialog ref="review" class="review-dialog pronunciation-review" aria-labelledby="p-review-title" @cancel="submitting && $event.preventDefault()">
      <header class="review-header"><h2 id="p-review-title">確認這筆多讀音標註</h2><button type="button" :disabled="submitting" aria-label="關閉預覽" @click="review?.close()">×</button></header>
      <div class="review-body"><div class="pronunciation-preview"><div v-for="(character, index) in characters" :key="index"><strong>{{ character }}</strong><span v-for="r in readings[index]" :key="`${r.syllable}:${r.tone}`">{{ displayBopomofo(r) }}</span></div></div><h3>說明</h3><p class="description-preview">{{ description || '未填寫' }}</p></div>
      <footer class="review-actions"><button type="button" class="review-edit" :disabled="submitting" @click="review?.close()">返回修改</button><button type="button" class="review-confirm" :disabled="submitting" @click="submit">{{ submitting ? '正在提交…' : user ? '確認並提交' : '確認並使用 GitHub 登入' }}</button></footer>
    </dialog>
  </div>
</template>
