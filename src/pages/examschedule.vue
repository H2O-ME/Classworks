<template>
  <v-container class="py-8">
    <v-card border rounded="xl" class="mx-auto" max-width="720">
      <v-card-text class="pa-8 text-center">
        <v-icon size="56" color="primary" class="mb-4">mdi-calendar-remove-outline</v-icon>
        <div class="text-h5 font-weight-bold mb-2">考试编辑器已下线</div>
        <div class="text-body-1 text-medium-emphasis mb-6">
          这个页面对应的旧考试配置功能已经移除，不再参与当前作业看板流程。
        </div>
        <v-btn color="primary" to="/">返回首页</v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
export default {
  name: "ExamScheduleRemovedPage",
};
</script>
