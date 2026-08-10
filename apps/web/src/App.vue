<script setup lang="ts">
import {
  CONTRIBUTION_AGREEMENT_VERSION,
  LIMITS,
  SubmissionDraftSchema,
  type Difficulty,
  type PaddingUnit,
  type SessionUser,
  type SubmissionDraft,
  type SubmissionResponse,
} from "@llavon/schema";
import {
  getReadingsForCharacter,
  isReadingForCharacter,
} from "@llavon/zhuyin";
import { computed, onMounted, ref, watch } from "vue";
import {
  acceptContributionAgreement,
  getSession,
  logout,
  submitValidationSample,
} from "./api";
import ContributionAgreement from "./components/ContributionAgreement.vue";
import DifficultyPicker from "./components/DifficultyPicker.vue";
import ZhuyinAligner, {
  type AlignmentCell,
} from "./components/ZhuyinAligner.vue";

const DRAFT_KEY = "llavon-validation-draft-v1";

const context = ref("");
const answer = ref("");
const difficulty = ref<Difficulty | null>(null);
const consent = ref(false);
const validationUseConsent = ref(false);
const creditAsCoauthor = ref(true);
const cells = ref<AlignmentCell[]>([]);
const submissionId = ref<string>(crypto.randomUUID());

const user = ref<SessionUser | null>(null);
const githubConfigured = ref(true);
const sessionLoading = ref(true);
const submitting = ref(false);
const errorMessage = ref("");
const result = ref<SubmissionResponse | null>(null);
const agreementAcceptedAt = ref<string | null>(null);
const agreementVersion = ref(CONTRIBUTION_AGREEMENT_VERSION);
const agreementLoading = ref(false);
const agreementError = ref("");

const answerCharacters = computed(() => Array.from(answer.value.normalize("NFC")));
const unresolved = computed(() => cells.value.some((cell) => !cell.selected));
const showAgreement = computed(
  () => Boolean(user.value) && agreementAcceptedAt.value === null,
);
const formComplete = computed(
  () =>
    context.value.length > 0 &&
    answerCharacters.value.length > 0 &&
    answerCharacters.value.length <= LIMITS.answer &&
    !unresolved.value &&
    difficulty.value !== null &&
    consent.value &&
    validationUseConsent.value,
);

function rebuildCells(preferred: Array<PaddingUnit | null> = []) {
  const previous = cells.value;
  cells.value = answerCharacters.value.map((character, index) => {
    const options = getReadingsForCharacter(character);
    const candidates = [
      preferred[index] ?? null,
      previous[index]?.character === character ? previous[index]?.selected ?? null : null,
    ];
    const selected =
      candidates.find(
        (candidate): candidate is PaddingUnit =>
          candidate !== null && isReadingForCharacter(character, candidate),
      ) ??
      (options.length === 1 ? options[0]! : null);
    return { character, options, selected };
  });
}

function chooseReading(index: number, reading: PaddingUnit) {
  const cell = cells.value[index];
  if (cell) cell.selected = { ...reading };
}

function saveDraft() {
  const payload = {
    submissionId: submissionId.value,
    context: context.value,
    answer: answer.value,
    padding: cells.value.map((cell) => cell.selected),
    difficulty: difficulty.value,
    consent: consent.value,
    validationUseConsent: validationUseConsent.value,
    creditAsCoauthor: creditAsCoauthor.value,
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
}

function loadDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw) as {
      submissionId?: string;
      context?: string;
      answer?: string;
      padding?: Array<PaddingUnit | null>;
      difficulty?: Difficulty | null;
      consent?: boolean;
      validationUseConsent?: boolean;
      creditAsCoauthor?: boolean;
    };
    if (saved.submissionId) submissionId.value = saved.submissionId;
    context.value = saved.context ?? "";
    answer.value = saved.answer ?? "";
    difficulty.value = saved.difficulty ?? null;
    consent.value = saved.consent ?? false;
    validationUseConsent.value = saved.validationUseConsent ?? false;
    creditAsCoauthor.value = saved.creditAsCoauthor ?? true;
    rebuildCells(saved.padding ?? []);
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function buildDraft(): SubmissionDraft | null {
  const payload = {
    submissionId: submissionId.value,
    context: context.value,
    answer: answer.value,
    padding: cells.value.map((cell) => cell.selected),
    difficulty: difficulty.value,
    publicContributionConsent: consent.value,
    validationUseConsent: validationUseConsent.value,
    creditAsCoauthor: creditAsCoauthor.value,
  };
  const parsed = SubmissionDraftSchema.safeParse(payload);
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? "請檢查所有欄位";
    return null;
  }
  return parsed.data;
}

async function submit() {
  errorMessage.value = "";
  result.value = null;
  const draft = buildDraft();
  if (!draft) return;

  if (!user.value) {
    saveDraft();
    window.location.assign("/api/auth/login?returnTo=/");
    return;
  }

  submitting.value = true;
  try {
    result.value = await submitValidationSample(draft);
    localStorage.removeItem(DRAFT_KEY);
    submissionId.value = crypto.randomUUID();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "提交失敗，請稍後再試";
  } finally {
    submitting.value = false;
  }
}

async function signOut() {
  await logout();
  user.value = null;
}

async function acceptAgreement() {
  agreementError.value = "";
  agreementLoading.value = true;
  try {
    const response = await acceptContributionAgreement(agreementVersion.value);
    agreementVersion.value = response.agreement.requiredVersion;
    agreementAcceptedAt.value = response.agreement.acceptedAt;
  } catch (error) {
    agreementError.value =
      error instanceof Error ? error.message : "無法記錄同意，請稍後再試";
  } finally {
    agreementLoading.value = false;
  }
}

watch(answer, () => rebuildCells());
watch([context, answer, difficulty, consent, validationUseConsent, creditAsCoauthor, cells], saveDraft, {
  deep: true,
});

onMounted(async () => {
  loadDraft();
  try {
    const session = await getSession();
    user.value = session.user;
    githubConfigured.value = session.githubConfigured;
    agreementVersion.value = session.agreement.requiredVersion;
    agreementAcceptedAt.value = session.agreement.acceptedAt;
  } catch {
    githubConfigured.value = false;
  } finally {
    sessionLoading.value = false;
  }
});
</script>

<template>
  <div class="site-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="拉風輸入法驗證集首頁">
        <img class="brand-logo" src="/llavon-logo.png" alt="拉風輸入法 Logo" />
        <span>
          <strong>拉風輸入法</strong>
          <small>驗證集共筆</small>
        </span>
      </a>

      <div class="account-area">
        <span v-if="sessionLoading" class="session-placeholder">確認登入狀態…</span>
        <template v-else-if="user">
          <a :href="user.profileUrl" class="user-chip" target="_blank" rel="noreferrer">
            <img :src="user.avatarUrl" alt="" />
            <span>@{{ user.githubLogin }}</span>
          </a>
          <button type="button" class="text-button" @click="signOut">登出</button>
        </template>
        <a v-else class="github-button compact" href="/api/auth/login?returnTo=/">
          使用 GitHub 登入
        </a>
      </div>
    </header>

    <main class="page-content">
      <section class="page-heading">
        <div>
          <h1>建立驗證集樣本</h1>
          <p>提交前文、正確答案、逐字注音與整體判讀難度。</p>
        </div>
        <span class="draft-state">草稿會自動保存</span>
      </section>

      <section class="form-card" aria-labelledby="form-title">
        <h2 id="form-title" class="sr-only">驗證樣本內容</h2>
        <form @submit.prevent="submit">
          <div class="field-group">
            <div class="field-label-row">
              <label for="context"><span class="field-index">1</span>前文</label>
              <span>{{ context.length }} / {{ LIMITS.context }}</span>
            </div>
            <textarea
              id="context"
              v-model="context"
              :maxlength="LIMITS.context"
              rows="4"
              placeholder="例如：下班後我想去超市買"
              required
            />
            <p class="field-hint">只填答案出現之前的內容，不要在這裡放入正確答案。</p>
          </div>

          <div class="field-group">
            <div class="field-label-row">
              <label for="answer"><span class="field-index">2</span>正確答案</label>
              <span>{{ answerCharacters.length }} / {{ LIMITS.answer }} 字</span>
            </div>
            <input
              id="answer"
              v-model="answer"
              :maxlength="LIMITS.answer"
              type="text"
              inputmode="text"
              autocomplete="off"
              placeholder="例如：牛奶"
              required
            />
            <p class="field-hint">填入你在這個語境下唯一預期輸出的文字。</p>
          </div>

          <div class="field-group alignment-group">
            <div class="field-label-row">
              <div>
                <span class="field-label"><span class="field-index">3</span>讀音對齊</span>
                <small>由目前輸入法候選表匹配</small>
              </div>
            </div>
            <ZhuyinAligner :cells="cells" @select="chooseReading" />
          </div>

          <div class="field-group">
            <div class="field-label-row stacked-mobile">
              <div>
                <span class="field-label"><span class="field-index">4</span>整體判讀難度</span>
                <small>綜合判斷語境本身的歧義，以及詞彙是否罕見、屬於領域專有名詞或需要背景知識；不考慮目前模型表現。</small>
              </div>
              <span>請選擇 1–5</span>
            </div>
            <DifficultyPicker v-model="difficulty" />
          </div>

          <label class="consent-row">
            <input v-model="consent" type="checkbox" />
            <span>
              我確認內容可公開、不含私人或敏感資料，且我有權提交這些文字。
            </span>
          </label>

          <label class="consent-row">
            <input v-model="validationUseConsent" type="checkbox" />
            <span>
              我同意將本筆資料作為驗證集使用。我了解本專案原則上不會直接將其作為訓練資料，且不保證目前或未來的模型在相同語境下必然輸出本筆正確答案。
            </span>
          </label>

          <label class="consent-row attribution-row">
            <input v-model="creditAsCoauthor" type="checkbox" />
            <span>
              <strong>（可選）在 GitHub commit 中將 @{{ user?.githubLogin ?? "我的帳號" }} 列為共同作者</strong>
              <small>勾選後，這筆 commit 會以 Co-authored-by 記錄你的 GitHub 帳號。</small>
            </span>
          </label>

          <div v-if="errorMessage" class="message error-message" role="alert">
            {{ errorMessage }}
          </div>

          <div v-if="result" class="message success-message" role="status">
            <div>
              <strong>投稿已排入驗證</strong>
              <span v-if="result.attributed">GitHub Actions 完成後，commit 會包含你的 Co-authored-by 紀錄。</span>
              <span v-else>GitHub Actions 完成後，資料會以不含個人身分的 commit 寫入驗證集。</span>
            </div>
          </div>

          <div v-if="!githubConfigured" class="message setup-message">
            本機尚未設定 GitHub App。表單與讀音對齊可以操作，但部署前需要完成後端環境變數。
          </div>

          <button
            type="submit"
            class="submit-button"
            :disabled="!formComplete || submitting"
          >
            <span>{{ submitting ? "正在寫入 GitHub…" : user ? "提交這筆驗證資料" : "使用 GitHub 登入並繼續" }}</span>
            <span aria-hidden="true">→</span>
          </button>
          <p class="submit-note">
            提交後會建立公開 GitHub commit；是否公開署名依上方選項決定。
          </p>
        </form>
      </section>
    </main>

    <footer>
      <span>llavon-ime / validation-web</span>
      <a href="https://github.com/llavon-ime" target="_blank" rel="noreferrer">開放原始碼</a>
    </footer>

    <ContributionAgreement
      :open="showAgreement"
      :version="agreementVersion"
      :loading="agreementLoading"
      :error="agreementError"
      @accept="acceptAgreement"
    />
  </div>
</template>
