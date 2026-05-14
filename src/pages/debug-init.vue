<template>
  <v-container>
    <v-row>
      <v-col
        cols="12"
        md="6"
      >
        <v-card>
          <v-card-title>本地模式调试面板</v-card-title>
          <v-card-text>
            <v-form>
              <v-text-field
                v-model="provider"
                label="server.provider (应为 kv-local)"
              />
            </v-form>
            <v-divider class="my-4" />

            <v-btn
              color="primary"
              @click="applySettings"
            >
              应用设置
            </v-btn>

            <v-list two-line>
              <v-list-item>
                <v-list-item-content>
                  <v-list-item-title>当前 settings</v-list-item-title>
                  <v-list-item-subtitle>{{ settingsDump }}</v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col
        cols="12"
        md="6"
      >
        <v-card>
          <v-card-title>本地模式说明</v-card-title>
          <v-card-text>
            已切换为纯本地存储模式，数据保存在浏览器 IndexedDB 中。
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import {ref, computed} from 'vue'
import {getSetting, setSetting} from '@/utils/settings'

const provider = ref(getSetting('server.provider') || 'kv-local')

const applySettings = () => {
  setSetting('server.provider', provider.value)
  location.reload()
}

const settingsDump = computed(() => {
  return JSON.stringify({
    provider: getSetting('server.provider'),
  }, null, 2)
})
</script>
