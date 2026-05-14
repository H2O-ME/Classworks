<template>
  <div />
</template>

<script setup>
import { onMounted } from "vue";
import { getSetting, setSetting } from "@/utils/settings";

onMounted(() => {
  const provider = getSetting("server.provider");
  if (provider !== "kv-local") {
    setSetting("server.provider", "kv-local");
  }
});
</script>
