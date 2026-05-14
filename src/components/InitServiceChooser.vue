<template>
  <div
    v-if="visible"
    class="init-overlay"
  >
    <div class="init-container">
      <div class="init-header">
        <div class="title">
          欢迎使用 Classworks
        </div>
        <div class="subtitle">
          本地存储模式 - 数据保存在浏览器中
        </div>
      </div>

      <!-- 本地模式说明卡片 -->
      <div class="main-card-row">
        <v-card
          class="main-service-card gradient-local"
          elevation="4"
        >
          <v-card-item>
            <div class="card-horizontal-layout">
              <div class="card-icon-wrapper">
                <v-icon
                  color="success"
                  size="48"
                >
                  mdi-database
                </v-icon>
              </div>
              <div class="card-content">
                <div class="text-h6 font-weight-bold">
                  本地存储模式
                </div>
                <div class="text-body-2 text-medium-emphasis mt-1">
                  所有数据将保存在浏览器本地存储中（IndexedDB），无需网络连接即可使用。
                </div>
              </div>
            </div>
          </v-card-item>
        </v-card>
      </div>

      <div class="actions">
        <v-btn
          color="primary"
          size="large"
          variant="elevated"
          @click="startUsing"
        >
          开始使用
        </v-btn>
      </div>

      <div class="footer-hint">
        提示：本地模式不支持多设备同步和数据共享。如需云同步功能，请使用在线版本。
      </div>
    </div>
  </div>
</template>

<script setup>
import {ref, onMounted} from 'vue'
import {getSetting, setSetting} from '@/utils/settings'

const props = defineProps({
  preconfig: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['done'])

const visible = ref(false)

onMounted(() => {
  const path = window.location.pathname
  const onHome = path === '/' || path === '/index' || path === '/index.html'

  if (onHome) {
    const provider = getSetting('server.provider')
    if (provider !== 'kv-local') {
      setSetting('server.provider', 'kv-local')
    }

    const hasUsedBefore = localStorage.getItem('classworks_local_mode_initialized')
    if (!hasUsedBefore) {
      visible.value = true
    } else {
      emit('done')
    }
  } else {
    emit('done')
  }
})

const startUsing = () => {
  localStorage.setItem('classworks_local_mode_initialized', 'true')
  visible.value = false
  emit('done')
}
</script>

<style scoped>
.init-overlay {
  position: relative;
}

.init-container {
  max-width: 600px;
  margin: 24px auto;
  padding: 8px 16px;
}

.init-header .title {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 8px;
}

.init-header .subtitle {
  font-size: 14px;
  opacity: .75;
  text-align: center;
}

.main-card-row {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 32px;
}

.main-service-card {
  min-height: 100px;
}

.main-service-card .v-card-item {
  padding: 20px 24px;
}

.card-horizontal-layout {
  display: flex;
  align-items: center;
  gap: 20px;
}

.card-icon-wrapper {
  flex-shrink: 0;
}

.card-content {
  flex: 1;
  text-align: left;
}

.gradient-local {
  background: linear-gradient(135deg, rgba(76, 175, 80, .12), rgba(0, 184, 212, 0.08) 60%);
  border: 2px solid rgba(76, 175, 80, .2);
}

.actions {
  margin-top: 32px;
  display: flex;
  justify-content: center;
}

.footer-hint {
  margin-top: 24px;
  font-size: 13px;
  opacity: .7;
  text-align: center;
}
</style>
