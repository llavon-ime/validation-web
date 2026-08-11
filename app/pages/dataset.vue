<script setup lang="ts">
import {
  DIFFICULTY_LEVELS,
  displayBopomofo,
  type Difficulty,
  type StoredValidationSample,
} from "#shared/utils/schema";
import { computed, onMounted, ref, watch } from "vue";
import DatasetSampleCard from "../components/DatasetSampleCard.vue";
import {
  DATASET_URL,
  fetchDataset,
  readCachedDataset,
} from "../utils/dataset";

useHead({ title: "瀏覽驗證資料集・拉風輸入法" });

const PAGE_SIZE = 12;
const samples = ref<StoredValidationSample[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const showingCache = ref(false);
const errorMessage = ref("");
const loadedAt = ref<Date | null>(null);
const query = ref("");
const difficulty = ref<Difficulty | null>(null);
const currentPage = ref(1);

const { user, ready: sessionReady, clear: clearUserSession } = useUserSession();

const entries = computed(() => {
  const needle = query.value.trim().normalize("NFC").toLocaleLowerCase("zh-Hant");
  return samples.value
    .map((sample, index) => ({ sample, number: index + 1 }))
    .filter(({ sample }) => {
      if (difficulty.value !== null && sample.difficulty !== difficulty.value) {
        return false;
      }
      if (!needle) return true;
      const readings = sample.padding.map(displayBopomofo).join("");
      return `${sample.context}${sample.answer}${readings}`
        .normalize("NFC")
        .toLocaleLowerCase("zh-Hant")
        .includes(needle);
    })
    .reverse();
});

const totalPages = computed(() => Math.max(1, Math.ceil(entries.value.length / PAGE_SIZE)));
const visibleEntries = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return entries.value.slice(start, start + PAGE_SIZE);
});
const difficultyCounts = computed(() =>
  Object.fromEntries(
    DIFFICULTY_LEVELS.map((level) => [
      level,
      samples.value.filter((sample) => sample.difficulty === level).length,
    ]),
  ) as Record<Difficulty, number>,
);
const updatedLabel = computed(() =>
  loadedAt.value
    ? new Intl.DateTimeFormat("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(loadedAt.value)
    : "尚未同步",
);

function selectDifficulty(value: Difficulty | null) {
  difficulty.value = value;
}

async function signOut() {
  await clearUserSession();
}

async function loadDataset() {
  let hasCachedData = false;
  try {
    const cached = await readCachedDataset();
    if (cached) {
      samples.value = cached.samples;
      loadedAt.value = cached.loadedAt;
      showingCache.value = true;
      hasCachedData = true;
      loading.value = false;
    }
  } catch {
    // Cache failure should not prevent a network refresh.
  }

  refreshing.value = hasCachedData;
  try {
    const fresh = await fetchDataset();
    samples.value = fresh.samples;
    loadedAt.value = fresh.loadedAt;
    showingCache.value = false;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = hasCachedData
      ? "目前無法向 GitHub 更新，暫時顯示上次成功載入的資料。"
      : error instanceof Error
        ? error.message
        : "目前無法讀取資料集";
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

watch([query, difficulty], () => {
  currentPage.value = 1;
});
watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages;
});

onMounted(loadDataset);
</script>

<template>
  <div class="site-shell">
    <header class="topbar dataset-topbar">
      <a class="brand" href="/" aria-label="拉風輸入法驗證集首頁">
        <img class="brand-logo" src="/llavon-logo.png" alt="拉風輸入法 Logo" />
        <span>
          <strong>拉風輸入法</strong>
          <small>驗證集共筆</small>
        </span>
      </a>

      <div class="account-area">
        <a class="dataset-link active" href="/dataset">瀏覽資料集</a>
        <span v-if="!sessionReady" class="session-placeholder">確認登入狀態…</span>
        <template v-else-if="user">
          <a :href="user.profileUrl" class="user-chip" target="_blank" rel="noreferrer">
            <img :src="user.avatarUrl" alt="" />
            <span>@{{ user.githubLogin }}</span>
          </a>
          <button type="button" class="text-button" @click="signOut">登出</button>
        </template>
        <a v-else class="github-button compact" href="/auth/github">使用 GitHub 登入</a>
      </div>
    </header>

    <main class="page-content dataset-page">
      <section class="page-heading dataset-heading">
        <div>
          <span class="dataset-eyebrow">PUBLIC VALIDATION SET</span>
          <h1>瀏覽已提交資料集</h1>
          <p>直接從公開 GitHub repository 讀取，依提交順序顯示最新收錄內容。</p>
        </div>
        <span class="draft-state dataset-sync-state">
          {{ refreshing ? "正在同步 GitHub…" : showingCache ? "顯示離線快取" : `同步於 ${updatedLabel}` }}
        </span>
      </section>

      <section class="dataset-toolbar" aria-label="資料集搜尋與篩選">
        <div class="dataset-summary">
          <div>
            <strong>{{ samples.length.toLocaleString() }}</strong>
            <span>筆公開樣本</span>
          </div>
          <div>
            <strong>{{ entries.length.toLocaleString() }}</strong>
            <span>筆符合條件</span>
          </div>
          <a :href="DATASET_URL" target="_blank" rel="noreferrer">查看原始 JSONL ↗</a>
        </div>

        <div class="dataset-search-row">
          <label for="dataset-search" class="sr-only">搜尋前文、答案或注音</label>
          <input
            id="dataset-search"
            v-model="query"
            class="dataset-search"
            type="search"
            placeholder="搜尋前文、答案或注音…"
            autocomplete="off"
          />
          <button v-if="query" type="button" class="clear-search" @click="query = ''">清除</button>
        </div>

        <div class="dataset-filters" aria-label="依難度篩選">
          <button
            type="button"
            :class="{ selected: difficulty === null }"
            @click="selectDifficulty(null)"
          >
            全部 <span>{{ samples.length }}</span>
          </button>
          <button
            v-for="level in DIFFICULTY_LEVELS"
            :key="level"
            type="button"
            :class="{ selected: difficulty === level }"
            @click="selectDifficulty(level)"
          >
            難度 {{ level }} <span>{{ difficultyCounts[level] }}</span>
          </button>
        </div>
      </section>

      <div v-if="errorMessage" class="dataset-notice" :class="{ warning: samples.length }" role="status">
        <strong>{{ samples.length ? "同步暫時中斷" : "無法載入資料集" }}</strong>
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadDataset">重新嘗試</button>
      </div>

      <section v-if="loading" class="dataset-loading" aria-live="polite">
        <div v-for="index in 3" :key="index" class="dataset-skeleton" />
        <span>正在從 GitHub 載入公開資料集…</span>
      </section>

      <section v-else-if="visibleEntries.length" class="dataset-results" aria-label="驗證資料集樣本">
        <DatasetSampleCard
          v-for="entry in visibleEntries"
          :key="entry.number"
          :sample="entry.sample"
          :number="entry.number"
        />
      </section>

      <section v-else class="dataset-empty-state">
        <span aria-hidden="true">無</span>
        <div>
          <strong>{{ samples.length ? "找不到符合條件的樣本" : "目前還沒有公開樣本" }}</strong>
          <p>{{ samples.length ? "試著清除搜尋文字或選擇其他難度。" : "第一筆資料收錄後會顯示在這裡。" }}</p>
        </div>
      </section>

      <nav v-if="!loading && totalPages > 1" class="dataset-pagination" aria-label="資料集分頁">
        <button type="button" :disabled="currentPage === 1" @click="currentPage -= 1">← 上一頁</button>
        <span>第 {{ currentPage }} / {{ totalPages }} 頁</span>
        <button type="button" :disabled="currentPage === totalPages" @click="currentPage += 1">下一頁 →</button>
      </nav>
    </main>

    <footer>
      <span>llavon-ime / validation-set</span>
      <a href="/">貢獻一筆資料</a>
    </footer>
  </div>
</template>
