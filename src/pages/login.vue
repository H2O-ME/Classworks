<template>
  <div class="page flex min-h-[100dvh] flex-col bg-background">
    <header class="sticky top-0 z-20 border-b border-border bg-background pt-[var(--sat,0px)]">
      <div class="mx-auto flex h-16 w-full max-w-[87.5rem] items-center gap-3 px-4 sm:px-6">
        <Button
          as-child
          variant="ghost"
          size="icon"
          class="-ml-1 size-10 shrink-0 rounded-lg"
        >
          <router-link
            to="/"
            aria-label="返回看板"
          >
            <i-mdi-chevron-left class="size-5" />
          </router-link>
        </Button>
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold leading-tight">
            登录
          </h1>
          <p class="truncate text-xs text-muted-foreground">
            同学看作业，课代表改自己那一科
          </p>
        </div>
      </div>
    </header>

    <main class="mx-auto flex w-full max-w-[28rem] flex-1 flex-col justify-center px-4 py-8 sm:px-6">
      <Card class="border-border bg-card">
        <CardHeader class="gap-1.5 p-5 pb-3">
          <CardTitle class="text-base">
            账号登录
          </CardTitle>
          <CardDescription class="text-xs leading-relaxed">
            账号是姓名拼音全拼，首次登录需要自己设一个新密码。
          </CardDescription>
        </CardHeader>

        <CardContent class="p-5 pt-0">
          <form
            class="flex flex-col gap-3"
            @submit.prevent="submit"
          >
            <div class="flex flex-col gap-1.5">
              <label
                class="text-xs font-medium text-muted-foreground"
                for="username"
              >账号</label>
              <Input
                id="username"
                v-model="username"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                placeholder="例如 wangjiashun"
                :disabled="busy"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label
                class="text-xs font-medium text-muted-foreground"
                for="password"
              >密码</label>
              <Input
                id="password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                placeholder="初始密码与账号相同"
                :disabled="busy"
              />
            </div>

            <Alert
              v-if="error"
              variant="destructive"
            >
              <i-mdi-alert-circle-outline class="size-4" />
              <AlertTitle>登录失败</AlertTitle>
              <AlertDescription>{{ error }}</AlertDescription>
            </Alert>

            <Button
              type="submit"
              class="mt-1 h-11 w-full"
              :disabled="busy || !username.trim() || !password"
            >
              <i-mdi-loading
                v-if="busy"
                class="size-4 animate-spin"
              />
              {{ busy ? "登录中…" : "登录" }}
            </Button>
          </form>

          <Separator class="my-4" />

          <p class="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <i-mdi-cellphone-link class="mt-0.5 size-3.5 shrink-0" />
            <span>不登录也能看作业；登录后可编辑，界面会按你的身份只放出能改的科目。</span>
          </p>
        </CardContent>
      </Card>
    </main>

    <!-- 首登改密：不能关、不能跳过，改完直接进看板 -->
    <Dialog :open="needPassword">
      <DialogContent>
        <div class="setup-card">
          <DialogTitle class="setup-title">
            首次登录，请设置新密码
          </DialogTitle>
          <p class="setup-text">
            {{ pendingName }}，初始密码班里都知道，先换成只有你自己知道的新密码。
          </p>

          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-medium text-muted-foreground"
              for="new-password"
            >新密码</label>
            <Input
              id="new-password"
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              placeholder="至少 6 位"
              :disabled="busy"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-xs font-medium text-muted-foreground"
              for="repeat-password"
            >再输一次</label>
            <Input
              id="repeat-password"
              v-model="repeatPassword"
              type="password"
              autocomplete="new-password"
              placeholder="两遍要一样"
              :disabled="busy"
            />
          </div>

          <p
            v-if="passwordHint"
            class="setup-hint"
          >
            {{ passwordHint }}
          </p>

          <Button
            class="mt-1 h-11 w-full"
            :disabled="busy || !canActivate"
            @click="activateAccount"
          >
            {{ busy ? "提交中…" : "设好并进入" }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <AppToast
      :show="toast.show"
      :message="toast.message"
      icon="mdi-account-check-outline"
      @dismiss="toast.show = false"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppToast from "@/components/AppToast.vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { activate, login } from "@/composables/useAuth";

const router = useRouter();

const username = ref("");
const password = ref("");
const newPassword = ref("");
const repeatPassword = ref("");
const busy = ref(false);
const error = ref("");
const tempToken = ref("");
const pendingName = ref("");
const toast = reactive({ show: false, message: "" });

const needPassword = computed(() => Boolean(tempToken.value));
const shortPassword = computed(() => newPassword.value.length > 0 && newPassword.value.length < 6);
const mismatch = computed(() => repeatPassword.value.length > 0 && newPassword.value !== repeatPassword.value);
const canActivate = computed(() => newPassword.value.length >= 6 && newPassword.value === repeatPassword.value);
const passwordHint = computed(() => {
  if (shortPassword.value) return "密码至少要 6 位";
  if (mismatch.value) return "两遍输入不一致";
  return "";
});

function flash(message) {
  toast.message = message;
  toast.show = true;
}

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await login(username.value.trim(), password.value);
    if (result.needPassword) {
      tempToken.value = result.tempToken;
      pendingName.value = result.realName || username.value.trim();
      return;
    }
    flash(`欢迎，${result.user?.realName || username.value.trim()}`);
    router.replace("/");
  } catch (caught) {
    error.value = caught.message || "登录失败";
  } finally {
    busy.value = false;
  }
}

async function activateAccount() {
  if (busy.value || !canActivate.value) return;
  busy.value = true;
  error.value = "";
  try {
    const user = await activate(tempToken.value, newPassword.value);
    tempToken.value = "";
    flash(`密码已设置，${user?.realName || ""}已登录`);
    router.replace("/");
  } catch (caught) {
    error.value = caught.message || "设置失败";
    // 临时凭证过期或无效：退回登录表单，让用户重新用初始密码进
    if (caught.status === 401) tempToken.value = "";
  } finally {
    busy.value = false;
  }
}

let previousTitle = null;

onMounted(() => {
  previousTitle = document.title;
  document.title = "登录";
});

onBeforeUnmount(() => {
  document.title = previousTitle;
});
</script>

<style scoped>
/* 首登改密卡片：沿用看板里的卡片观感（DialogContent 只管定位） */
.setup-card {
  display: flex;
  width: 100%;
  max-width: 26.25rem;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.75rem;
  background: #171717;
  box-shadow: 0 1.5rem 3.5rem rgba(0, 0, 0, 0.32);
}

.setup-title {
  color: #f1f1f1;
  font-size: 1.0625rem;
  font-weight: 800;
}

.setup-text {
  margin: 0;
  color: rgba(255, 255, 255, 0.66);
  font-size: 0.875rem;
  line-height: 1.6;
}

.setup-hint {
  margin: 0;
  color: #fca5a5;
  font-size: 0.8125rem;
}
</style>
