<template>
  <div class="app-shell">
    <div class="app-gradient-background" />

    <router-view v-slot="{ Component, route }">
      <transition
        mode="out-in"
        name="md3"
      >
        <component
          :is="Component"
          :key="route.path"
        />
      </transition>
    </router-view>
  </div>
</template>

<script setup>
</script>

<style>
.app-shell {
  min-height: 100dvh;
  background: #111111;
  color: rgba(255, 255, 255, 0.92);
}

.md3-enter-active,
.md3-leave-active {
  transition:
    opacity 0.26s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}

.md3-enter-from {
  opacity: 0;
  transform: translateX(0.35vw);
}

.md3-leave-to {
  opacity: 0;
  transform: translateX(-0.35vw);
}

.app-gradient-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  /* background 第一个图层在最上：网格线放渐变之前，否则被不透明渐变盖住永远不显示 */
  background:
    linear-gradient(rgba(255, 255, 255, 0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px),
    linear-gradient(180deg, #161616 0%, #121212 42%, #101010 100%);
  background-size:
    100% 1.75rem,
    1.75rem 100%,
    auto;
}

@media (prefers-reduced-motion: reduce) {
  .md3-enter-active,
  .md3-leave-active {
    transition: none;
  }
}
</style>
