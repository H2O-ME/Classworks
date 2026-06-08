import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import App from "./App.vue";
import { registerPlugins } from "@/plugins";

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration || !swUrl) return;
    setInterval(() => {
      registration.update().catch(() => null);
    }, 60 * 60 * 1000);
  },
});

const app = createApp(App);

registerPlugins(app);
app.mount("#app");
