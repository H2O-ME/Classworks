<template>
  <div class="page flex min-h-[100dvh] flex-col bg-background">
    <!-- 顶栏 -->
    <header class="sticky top-0 z-20 border-b border-border bg-background pt-[var(--sat,0px)]">
      <div class="mx-auto flex h-16 w-full max-w-[87.5rem] items-center justify-between gap-4 px-4 sm:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <Button
            as-child
            variant="ghost"
            size="icon"
            class="-ml-1 size-10 shrink-0 rounded-lg"
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
              本机权限与云端连接
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          class="h-10 shrink-0 gap-1.5"
          :disabled="health === 'checking'"
          @click="checkHealth"
        >
          <i-mdi-refresh
            class="size-4"
            :class="{ 'animate-spin': health === 'checking' }"
          />
          <span class="hidden sm:inline">
            {{ health === "checking" ? "检测中…" : "重新检测" }}
          </span>
        </Button>
      </div>
    </header>

    <!-- 主体：左侧状态、右侧历史 -->
    <main class="mx-auto w-full max-w-[87.5rem] flex-1 px-4 py-5 sm:px-6">
      <div class="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <!-- 左列：权限 + 连接 -->
        <div class="flex flex-col gap-4">
          <Card class="border-border bg-card">
            <CardHeader class="gap-1.5 p-5 pb-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2.5">
                  <i-mdi-shield-check-outline class="size-5 text-muted-foreground" />
                  <CardTitle class="text-base">
                    访问权限
                  </CardTitle>
                </div>
                <Badge
                  :variant="isWritable ? 'default' : 'secondary'"
                  class="shrink-0 gap-1.5 font-medium"
                >
                  <i-mdi-circle
                    class="size-1.5"
                    :class="isWritable ? 'text-green-400' : 'text-muted-foreground'"
                  />
                  {{ isWritable ? "可读写" : "只读" }}
                </Badge>
              </div>
              <CardDescription class="text-xs leading-relaxed">
                写权限来自地址里的密钥，读出后立刻从地址栏抹掉，只存在本机。
              </CardDescription>
            </CardHeader>

            <CardContent class="p-5 pt-0">
              <Separator class="mb-1" />
              <dl class="flex flex-col">
                <div class="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <dt class="shrink-0 text-muted-foreground">
                    当前教室
                  </dt>
                  <dd class="min-w-0 truncate font-medium">
                    {{ room }}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <dt class="shrink-0 text-muted-foreground">
                    写权限
                  </dt>
                  <dd class="min-w-0 truncate font-medium">
                    {{ isWritable ? "可写" : "只读" }}
                  </dd>
                </div>
              </dl>

              <Button
                v-if="isWritable"
                variant="outline"
                class="mt-3 h-10 w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                @click="forgetKey"
              >
                <i-mdi-logout-variant class="size-4" />
                清除本机写权限
              </Button>
            </CardContent>
          </Card>

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
                作业数据存在教室后端服务器上；本机会缓存最近一次内容，断网也能看。
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

              <Alert
                v-if="health === 'fail'"
                variant="destructive"
                class="mt-3"
              >
                <i-mdi-alert-circle-outline class="size-4" />
                <AlertTitle>无法连接后端</AlertTitle>
                <AlertDescription>{{ healthError }}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>

        <!-- 右列：变更历史内联，不再开弹窗 -->
        <Card class="flex min-h-[26.25rem] flex-col border-border bg-card">
          <CardHeader class="gap-1.5 p-5 pb-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <i-mdi-history class="size-5 text-muted-foreground" />
                <CardTitle class="text-base">
                  变更历史
                </CardTitle>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <Badge
                  variant="secondary"
                  class="font-medium"
                >
                  {{ history.length }} 条
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8"
                  :disabled="historyLoading"
                  aria-label="刷新历史"
                  @click="refreshHistory"
                >
                  <i-mdi-refresh
                    class="size-4"
                    :class="{ 'animate-spin': historyLoading }"
                  />
                </Button>
              </div>
            </div>
            <CardDescription class="text-xs leading-relaxed">
              {{ dateLabel }} · 每次保存都会留下一条记录，可一键回填到当前版本。
            </CardDescription>
          </CardHeader>

          <CardContent class="flex min-h-0 flex-1 flex-col p-5 pt-0">
            <Separator class="mb-3" />

            <div
              v-if="history.length === 0"
              class="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center"
            >
              <i-mdi-history class="size-8 text-muted-foreground/40" />
              <p class="text-sm text-muted-foreground">
                这一天还没有变更记录
              </p>
            </div>

            <ScrollArea
              v-else
              class="max-h-[min(52vh,30rem)] flex-1 pr-3"
            >
              <ul class="flex flex-col gap-2">
                <li
                  v-for="item in history"
                  :key="item.id"
                  class="rounded-lg border border-border bg-background/60 p-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant="outline"
                        class="shrink-0 px-1.5 py-0 text-[0.6875rem] font-medium"
                      >
                        {{ item.subject }}
                      </Badge>
                      <span class="truncate">{{ formatTime(item.createdAt) }}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-8 shrink-0 gap-1 px-2 text-xs"
                      @click="restore(item)"
                    >
                      <i-mdi-restore class="size-3.5" />
                      回填
                    </Button>
                  </div>
                  <p class="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">
                    {{ item.content || "（空）" }}
                  </p>
                </li>
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </main>

    <AppToast
      :show="toast.show"
      :message="toast.message"
      icon="mdi-cloud-sync-outline"
      @dismiss="toast.show = false"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import AppToast from "@/components/AppToast.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { API_BASE, formatTime, getHealth } from "@/api/board";
import { useAuth } from "@/composables/useAuth";
import { useBoard } from "@/composables/useBoard";
import { formatDateLabel, formatDateKey } from "@/utils/board";

const { room, isWritable } = useAuth();
const { history, loadHistory, restoreFromHistory } = useBoard();

const todayKey = formatDateKey(new Date());
const dateLabel = computed(() => formatDateLabel(todayKey));

const health = ref("checking");
const healthError = ref("");
const historyLoading = ref(false);
const toast = reactive({ show: false, message: "" });

const healthLabel = computed(
  () => ({ checking: "检测中", ok: "已连接", fail: "连接失败" })[health.value],
);

function flash(message) {
  toast.message = message;
  toast.show = true;
}

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

async function refreshHistory() {
  historyLoading.value = true;
  try {
    await loadHistory();
  } finally {
    historyLoading.value = false;
  }
}

async function restore(item) {
  const result = await restoreFromHistory(item);
  flash(result.ok ? `已回填「${item.subject}」` : "回填失败，请稍后重试");
}

function forgetKey() {
  try {
    window.localStorage.removeItem("classworks:auth");
  } catch (error) {
    console.warn("清除写权限失败:", error);
  }
  // 内存里的密钥也一起清掉：重新加载后即变为只读
  window.location.reload();
}

let previousTitle = null;

onMounted(() => {
  previousTitle = document.title;
  document.title = "设置";
  checkHealth();
  // 历史改为内联展示，进页面就拉一次
  refreshHistory();
});

onBeforeUnmount(() => {
  document.title = previousTitle;
});
</script>
