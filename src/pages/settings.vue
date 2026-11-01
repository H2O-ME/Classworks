<template>
  <div class="page flex min-h-[100dvh] flex-col bg-background">
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
              当前身份与云端连接
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

    <main class="mx-auto w-full max-w-[87.5rem] flex-1 px-4 py-5 sm:px-6">
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <!-- 身份 -->
        <Card class="border-border bg-card">
          <CardHeader class="gap-1.5 p-5 pb-3">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <i-mdi-account-circle-outline class="size-5 text-muted-foreground" />
                <CardTitle class="text-base">
                  当前身份
                </CardTitle>
              </div>
              <Badge
                :variant="canEditAny ? 'default' : 'secondary'"
                class="shrink-0 gap-1.5 font-medium"
              >
                <i-mdi-circle
                  class="size-1.5"
                  :class="canEditAny ? 'text-green-400' : 'text-muted-foreground'"
                />
                {{ canEditAny ? "可编辑" : "只读" }}
              </Badge>
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
                  {{ isBoard ? "希沃白板（免密）" : userLabel }}
                </dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-2.5 text-sm">
                <dt class="shrink-0 text-muted-foreground">
                  姓名
                </dt>
                <dd class="min-w-0 truncate font-medium">
                  {{ user?.realName || (isBoard ? "讲台白板" : "未登录") }}
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

            <Button
              v-if="signedIn && !isBoard"
              variant="outline"
              class="mt-3 h-10 w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              @click="signOut"
            >
              <i-mdi-logout-variant class="size-4" />
              退出登录
            </Button>
            <Button
              v-else-if="!signedIn"
              as-child
              class="mt-3 h-10 w-full gap-2"
            >
              <router-link to="/login">
                <i-mdi-login-variant class="size-4" />
                去登录
              </router-link>
            </Button>
          </CardContent>
        </Card>

        <!-- 云端连接 -->
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
              作业存在教室后端；本机会缓存最近一次内容，断网也能看。
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

            <p class="mt-3 text-xs leading-relaxed text-muted-foreground">
              账号由管理员在服务器上分配；忘了密码就找管理员重置。
            </p>
          </CardContent>
        </Card>
      </div>
    </main>

    <AppToast
      :show="toast.show"
      :message="toast.message"
      icon="mdi-account-circle-outline"
      @dismiss="toast.show = false"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppToast from "@/components/AppToast.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { API_BASE, getHealth } from "@/api/board";
import { useAuth } from "@/composables/useAuth";
import { SUBJECTS } from "@/utils/board";

const router = useRouter();
const { isBoard, user, userLabel, canEditAny, canEdit, logout, refreshIdentity } = useAuth();

const health = ref("checking");
const healthError = ref("");
const toast = reactive({ show: false, message: "" });

const healthLabel = computed(
  () => ({ checking: "检测中", ok: "已连接", fail: "连接失败" })[health.value],
);
const signedIn = computed(() => isBoard.value || Boolean(user.value));
const editableLabel = computed(() => {
  const names = SUBJECTS.filter((name) => canEdit(name));
  return names.length === SUBJECTS.length ? "全部 6 科" : names.join("、") || "无（只读）";
});

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

function signOut() {
  logout();
  flash("已退出登录");
  router.replace("/");
}

let previousTitle = null;

onMounted(() => {
  previousTitle = document.title;
  document.title = "设置";
  checkHealth();
  refreshIdentity();
});

onBeforeUnmount(() => {
  document.title = previousTitle;
});
</script>
