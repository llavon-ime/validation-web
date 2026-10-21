export default defineNuxtConfig({
  modules: ["nuxt-auth-utils"],
  css: ["~/assets/styles.css"],
  devtools: { enabled: false },
  runtimeConfig: {
    session: {
      maxAge: 60 * 60 * 24 * 30,
    },
    // NUXT_REQUIRE_GITHUB_LOGIN=false：本地測試用，登入改為本地測試帳號，投稿不會實際提交
    requireGithubLogin: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: "zh-Hant" },
      title: "拉風輸入法・驗證集共筆",
      meta: [
        { name: "theme-color", content: "#f7f4ee" },
        {
          name: "description",
          content: "協助拉風輸入法建立更貼近日常使用的繁體中文注音驗證集。",
        },
      ],
    },
  },
});
