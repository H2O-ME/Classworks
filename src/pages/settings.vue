<template>
  <div class="page flex min-h-[100dvh] flex-col bg-background">
    <header class="sticky top-0 z-20 border-b border-border bg-background pt-[var(--sat,0px)]">
      <div class="mx-auto flex h-16 w-full max-w-[87.5rem] items-center justify-between gap-4 px-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <Button
            as-child
            variant="ghost"
            size="icon"
            class="-ml-1 size-12 shrink-0 rounded-lg"
          >
            <router-link
              to="/"
              aria-label="返回首页"
            >
              <i-mdi-chevron-left class="size-5" />
            </router-link>
          </Button>
          <div class="min-w-0">
            <h1 class="truncate text-lg font-semibold leading-tight">
              设置
            </h1>
            <p class="truncate text-xs text-muted-foreground">
              外观、身份与云端连接
            </p>
          </div>
        </div>

        <Badge
          :variant="isBoard ? 'default' : 'secondary'"
          class="shrink-0 gap-1.5 font-medium"
        >
          <i-mdi-circle
            class="size-1.5"
            :class="isBoard ? 'text-green-400' : 'text-muted-foreground'"
          />
          {{ isBoard ? "可编辑" : "只读" }}
        </Badge>
      </div>

      <!-- 分页签：外观 / 身份 / 云端 -->
      <div class="mx-auto w-full max-w-[87.5rem] px-4 pb-3 sm:px-6">
        <div
          class="inline-flex rounded-lg border border-border bg-card p-1"
          role="tablist"
          aria-label="设置分区"
        >
          <button
            v-for="tab in TABS"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="section === tab.id"
            class="tab-btn"
            :class="{ 'tab-btn-active': section === tab.id }"
            @click="section = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[87.5rem] flex-1 px-4 py-5 sm:px-6">
      <!-- ══ 外观 ══ -->
      <div
        v-show="section === 'appearance'"
        class="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
      >
        <div class="flex flex-col gap-4">
          <!-- 字体市场 -->
          <Card class="border-border bg-card">
            <CardHeader class="gap-1.5 p-5 pb-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <i-mdi-format-font class="size-5 text-muted-foreground" />
                  <CardTitle class="text-base">
                    字体市场
                  </CardTitle>
                </div>
                <Badge
                  variant="secondary"
                  class="shrink-0 gap-1 font-medium"
                >
                  在线字体按需加载
                </Badge>
              </div>
              <CardDescription class="text-xs leading-relaxed">
                选定即时生效，只下载页面用到的字形分片；断网时自动回落系统字体。
              </CardDescription>
            </CardHeader>

            <CardContent class="p-5 pt-0">
              <div class="font-grid">
                <button
                  v-for="font in FONTS"
                  :key="font.id"
                  type="button"
                  class="font-card"
                  :class="{ 'font-card-active': appearance.fontFamily === font.id }"
                  :aria-pressed="appearance.fontFamily === font.id"
                  @click="pickFont(font)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span
                      class="font-card-name"
                      :style="{ fontFamily: font.stack }"
                    >{{ font.name }}</span>
                    <span class="font-tag">
                      {{ loadingFont === font.id ? "加载中" : font.css ? "在线" : "本地" }}
                    </span>
                  </div>
                  <div
                    class="font-card-sample"
                    :style="{ fontFamily: font.stack }"
                  >
                    语文作业 Aa
                  </div>
                  <div class="font-card-desc">
                    {{ font.desc }}
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          <!-- 字体微调 -->
          <Card class="border-border bg-card">
            <CardHeader class="gap-1.5 p-5 pb-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <i-mdi-tune-variant class="size-5 text-muted-foreground" />
                  <CardTitle class="text-base">
                    字体微调
                  </CardTitle>
                </div>
                <Button
                  variant="outline"
                  class="h-10 shrink-0 gap-1.5"
                  @click="resetAll"
                >
                  <i-mdi-restore class="size-4" />
                  恢复默认
                </Button>
              </div>
            </CardHeader>

            <CardContent class="flex flex-col gap-4 p-5 pt-0">
              <div
                v-for="item in ADJUSTERS"
                :key="item.key"
                class="adjust-row"
              >
                <div class="adjust-head">
                  <label
                    class="adjust-label"
                    :for="`adj-${item.key}`"
                  >{{ item.label }}</label>
                  <span class="adjust-value">{{ item.display(appearance) }}</span>
                </div>
                <input
                  :id="`adj-${item.key}`"
                  class="adjust-range"
                  type="range"
                  :min="item.min"
                  :max="item.max"
                  :step="item.step"
                  :value="appearance[item.key]"
                  @input="onAdjust(item.key, $event)"
                >
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- 实时预览 -->
        <div class="self-start lg:sticky lg:top-[8.5rem]">
          <Card class="border-border bg-card">
            <CardHeader class="gap-1.5 p-5 pb-3">
              <div class="flex items-center gap-2.5">
                <i-mdi-eye-outline class="size-5 text-muted-foreground" />
                <CardTitle class="text-base">
                  实时预览
                </CardTitle>
              </div>
              <CardDescription class="text-xs leading-relaxed">
                与首页作业卡同一套样式，改动即时反映。
              </CardDescription>
            </CardHeader>

            <CardContent class="p-5 pt-0">
              <article class="preview-card">
                <div class="preview-head">
                  <span class="preview-subject">语文</span>
                  <i-mdi-pencil-outline class="preview-pencil" />
                </div>
                <div
                  class="preview-body"
                  :style="previewStyle"
                >
                  <div
                    v-for="(line, index) in PREVIEW_LINES"
                    :key="index"
                    class="preview-line"
                  >
                    {{ line }}
                  </div>
                </div>
              </article>
              <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
                字号 {{ previewPx }}px · 行距 {{ appearance.lineHeight }} · 字距
                {{ appearance.letterSpacing }}em · 段距 {{ appearance.paragraphGap }}em
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- ══ 身份 ══ -->
      <div
        v-show="section === 'identity'"
        class="grid gap-4 md:grid-cols-2"
      >
        <Card class="border-border bg-card">
          <CardHeader class="gap-1.5 p-5 pb-3">
            <div class="flex items-center gap-2.5">
              <i-mdi-account-circle-outline class="size-5 text-muted-foreground" />
              <CardTitle class="text-base">
                当前身份
              </CardTitle>
            </div>
            <CardDescription class="text-xs leading-relaxed">
              界面只放出你有权限改的科目，越权请求服务端也会拒。
            </CardDescription>
          </CardHeader>
          <CardContent class="p-5 pt-0">
            <Separator class="mb-1" />
            <dl class="flex flex-col">
              <div class="flex items-center justify-between gap-4 py-2.5 text-sm">
                <dt class="shrink-0 text-muted-foreground">
                  身份
                </dt>
                <dd class="min-w-0 truncate font-medium">
                  {{ isBoard ? "希沃白板（免密）" : "访客（只读）" }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-2.5 text-sm">
                <dt class="shrink-0 text-muted-foreground">
                  可编辑科目
                </dt>
                <dd class="min-w-0 truncate text-right font-medium">
                  {{ editableLabel }}
                </dd>
              </div>
            </dl>
            <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
              写权限由链接里的 <code>?key=</code> 口令决定；没有口令就是只读。
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- ══ 云端 ══ -->
      <div
        v-show="section === 'cloud'"
        class="grid gap-4 md:grid-cols-2"
      >
        <Card class="border-border bg-card">
          <CardHeader class="gap-1.5 p-5 pb-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <i-mdi-cloud-sync-outline class="size-5 text-muted-foreground" />
                <CardTitle class="text-base">
                  云端连接
                </CardTitle>
              </div>
              <Badge
                :variant="health === 'ok' ? 'default' : health === 'fail' ? 'destructive' : 'secondary'"
                class="shrink-0 gap-1.5 font-medium"
              >
                <i-mdi-circle
                  class="size-1.5"
                  :class="health === 'ok' ? 'text-green-400' : health === 'fail' ? 'text-red-300' : 'text-muted-foreground'"
                />
                {{ healthLabel }}
              </Badge>
            </div>
            <CardDescription class="text-xs leading-relaxed">
              作业存在教室后端；多设备每 30 秒自动拉取一次更新，断网也能看。
            </CardDescription>
          </CardHeader>

          <CardContent class="p-5 pt-0">
            <Separator class="mb-1" />
            <div class="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span class="shrink-0 text-muted-foreground">接口地址</span>
              <code class="min-w-0 truncate font-mono text-xs text-foreground/80">
                {{ API_BASE || "同源 /api" }}
              </code>
            </div>
            <div class="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span class="shrink-0 text-muted-foreground">同步间隔</span>
              <span class="min-w-0 truncate font-medium">30 秒（切回页面立即同步）</span>
            </div>

            <Alert
              v-if="health === 'fail'"
              variant="destructive"
              class="mt-3"
            >
              <i-mdi-alert-circle-outline class="size-4" />
              <AlertTitle>无法连接后端</AlertTitle>
              <AlertDescription>{{ healthError }}</AlertDescription>
            </Alert>

            <Button
              variant="outline"
              class="mt-3 h-12 w-full gap-1.5"
              :disabled="health === 'checking'"
              @click="checkHealth"
            >
              <i-mdi-refresh
                class="size-4"
                :class="{ 'animate-spin': health === 'checking' }"
              />
              {{ health === "checking" ? "检测中…" : "重新检测" }}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { API_BASE, getHealth } from "@/api/board";
import { useAuth } from "@/composables/useAuth";
import { SUBJECTS, getFontSize } from "@/utils/board";
import { FONTS, ensureFont } from "@/utils/fonts";
import {
  LIMITS,
  appearanceStyle,
  getAppearance,
  resetAppearance,
  setAppearance,
} from "@/utils/settings";

const { isBoard, canEdit } = useAuth();

const TABS = [
  { id: "appearance", label: "外观" },
  { id: "identity", label: "身份" },
  { id: "cloud", label: "云端" },
];
const section = ref("appearance");

const PREVIEW_LINES = ["完成学案的 D 和七选五", "背诵《岳阳楼记》二三四段", "整理错题，明天课上讲评"];

const appearance = ref(getAppearance());
const loadingFont = ref("");

const previewStyle = computed(() => appearanceStyle(appearance.value));
const previewPx = computed(() => Math.round(getFontSize(appearance.value.fontLevel) * 1.25));

// 微调项：滑杆范围与显示格式集中声明，模板只遍历
const ADJUSTERS = [
  {
    key: "fontLevel",
    label: "字号",
    ...LIMITS.fontLevel,
    display: (a) => `${Math.round(getFontSize(a.fontLevel) * 1.25)}px`,
  },
  {
    key: "lineHeight",
    label: "行间距",
    ...LIMITS.lineHeight,
    display: (a) => `${a.lineHeight}`,
  },
  {
    key: "letterSpacing",
    label: "字间距",
    ...LIMITS.letterSpacing,
    display: (a) => `${a.letterSpacing}em`,
  },
  {
    key: "paragraphGap",
    label: "段间距",
    ...LIMITS.paragraphGap,
    display: (a) => `${a.paragraphGap}em`,
  },
];

function apply(patch) {
  setAppearance(patch);
  appearance.value = getAppearance();
}

function onAdjust(key, event) {
  apply({ [key]: Number(event.target.value) });
}

function pickFont(font) {
  apply({ fontFamily: font.id });
  if (!font.css) return;
  loadingFont.value = font.id;
  ensureFont(font.id);
  // 字体文件异步到达，预览会随 font-display:swap 自动换；这里只收起加载态
  Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]).finally(() => {
    if (loadingFont.value === font.id) loadingFont.value = "";
  });
}

function resetAll() {
  resetAppearance();
  appearance.value = getAppearance();
}

const health = ref("checking");
const healthError = ref("");
const healthLabel = computed(() => ({ checking: "检测中", ok: "已连接", fail: "连接失败" })[health.value]);
const editableLabel = computed(() => {
  const names = SUBJECTS.filter((name) => canEdit(name));
  return names.length === SUBJECTS.length ? "全部 6 科" : names.join("、") || "无（只读）";
});

async function checkHealth() {
  health.value = "checking";
  healthError.value = "";
  try {
    const result = await getHealth();
    health.value = result?.ok === false ? "fail" : "ok";
    if (result?.ok === false) healthError.value = "后端返回异常";
  } catch (error) {
    health.value = "fail";
    healthError.value = error.status === 0 ? "网络不可达，检查后端是否在运行" : error.message;
  }
}

let previousTitle = null;

onMounted(() => {
  previousTitle = document.title;
  document.title = "设置";
  checkHealth();
  // 进页面即加载已选字体，预览与首页保持一致
  ensureFont(appearance.value.fontFamily);
});

onBeforeUnmount(() => {
  document.title = previousTitle;
});
</script>

<style scoped>
.tab-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.4rem;
  min-width: 4.5rem;
  padding: 0 1rem;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.tab-btn:hover {
  color: rgba(255, 255, 255, 0.85);
}

.tab-btn-active {
  background: rgba(174, 191, 221, 0.14);
  color: #e7eef9;
}

.font-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.625rem;
}

.font-card {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-height: 6.5rem;
  padding: 0.75rem 0.875rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.625rem;
  background: rgba(255, 255, 255, 0.02);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.font-card:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
}

.font-card-active {
  border-color: rgba(174, 191, 221, 0.55);
  background: rgba(174, 191, 221, 0.1);
}

.font-card-name {
  min-width: 0;
  overflow: hidden;
  color: #f1f1f1;
  font-size: 1rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-tag {
  flex: 0 0 auto;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.6875rem;
  font-weight: 600;
}

.font-card-active .font-tag {
  background: rgba(174, 191, 221, 0.2);
  color: #cfdcf2;
}

.font-card-sample {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.125rem;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-card-desc {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.42);
  font-size: 0.75rem;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adjust-row {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.adjust-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.adjust-label {
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.875rem;
  font-weight: 600;
}

.adjust-value {
  color: rgba(174, 191, 221, 0.95);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
  font-weight: 700;
}

/* 原生滑杆：触控热区高度 48px，老 WebView 也支持 */
.adjust-range {
  width: 100%;
  height: 2.4rem;
  margin: 0;
  accent-color: #aebfdd;
  background: transparent;
  cursor: pointer;
}

.preview-card {
  padding: 1.125rem 1.125rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5625rem;
  background: #191919;
}

.preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.preview-subject {
  color: #f3f3f3;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.25;
}

.preview-pencil {
  width: 0.9375rem;
  height: 0.9375rem;
  flex: 0 0 auto;
  color: rgba(255, 255, 255, 0.55);
}

/* 与 HomeworkGrid 的 .homework-card-content 同构：flex 列 + --line-gap 段距 */
.preview-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--line-gap, 0.625rem);
}

.preview-line {
  color: rgba(255, 255, 255, 0.78);
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
