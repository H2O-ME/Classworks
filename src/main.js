import { createApp } from "vue";
import { registerSW } from "virtual:pwa-register";
import App from "./App.vue";
import { registerPlugins } from "@/plugins";

if (import.meta.env.DEV) {
  registerDevServiceWorker();
} else {
  registerAppServiceWorker();
}

const app = createApp(App);

registerPlugins(app);
app.mount("#app");

function registerAppServiceWorker() {
  registerSW({
    immediate: true,
    onRegisteredSW(_, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => null);
      }, 60 * 60 * 1000);
    },
  });
}

async function registerDevServiceWorker() {
  if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
    return;
  }

  registerAppServiceWorker();
}
