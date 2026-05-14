/**
 * main.js
 *
 * 精简启动流水线：快速挂载 Vue app
 */

// 核心插件（Vuetify / Router / Pinia）
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'
import GlobalMessage from '@/components/GlobalMessage.vue'

// Composables
import { createApp } from 'vue'

import messageService from './utils/message'

const app = createApp(App)

registerPlugins(app)
app.use(messageService)

app.component('GlobalMessage', GlobalMessage)

// 挂载 Vue app
app.mount('#app')
