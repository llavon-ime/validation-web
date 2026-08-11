<script setup lang="ts">
import type { Difficulty } from "#shared/utils/schema";
import type { AlignmentCell } from "./ZhuyinAligner.vue";
import SubmissionPreview from "./SubmissionPreview.vue";

defineProps<{
  open: boolean;
  context: string;
  cells: AlignmentCell[];
  difficulty: Difficulty | null;
  authenticated: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

const difficultyLabels: Record<Difficulty, string> = {
  1: "1・容易",
  2: "2・略有難度",
  3: "3・中等",
  4: "4・困難",
  5: "5・極困難",
};
</script>

<template>
  <div v-if="open" class="review-overlay" role="presentation" @click.self="emit('close')">
    <section
      class="review-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-title"
    >
      <header class="review-header">
        <div>
          <span>送出前確認</span>
          <h2 id="review-title">這筆提交組字後會是這樣</h2>
        </div>
        <button type="button" aria-label="關閉預覽" @click="emit('close')">×</button>
      </header>

      <div class="review-body">
        <SubmissionPreview :context="context" :cells="cells" />
        <dl class="review-metadata">
          <div>
            <dt>整體判讀難度</dt>
            <dd>{{ difficulty ? difficultyLabels[difficulty] : "尚未選擇" }}</dd>
          </div>
          <div>
            <dt>下一步</dt>
            <dd>{{ authenticated ? "確認後寫入 GitHub" : "確認後使用 GitHub 登入" }}</dd>
          </div>
        </dl>
      </div>

      <footer class="review-actions">
        <button type="button" class="review-edit" :disabled="loading" @click="emit('close')">
          返回修改
        </button>
        <button type="button" class="review-confirm" :disabled="loading" @click="emit('confirm')">
          {{ loading ? "正在寫入 GitHub…" : authenticated ? "確認並提交" : "內容正確，前往 GitHub 登入" }}
          <span aria-hidden="true">→</span>
        </button>
        <p v-if="!authenticated">預覽不需要登入；只有確認提交時才會要求 GitHub 身分。</p>
      </footer>
    </section>
  </div>
</template>
