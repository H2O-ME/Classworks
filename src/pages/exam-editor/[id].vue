<template>
  <v-container class="py-8">
    <v-card border rounded="xl" class="mx-auto" max-width="720">
      <v-card-text class="pa-8 text-center">
        <v-icon size="56" color="primary" class="mb-4">mdi-file-remove-outline</v-icon>
        <div class="text-h5 font-weight-bold mb-2">考试编辑功能已移除</div>
        <div class="text-body-1 text-medium-emphasis mb-6">
          旧的考试编辑路由已停用，避免再拉起遗留组件导致页面异常。
        </div>
        <v-btn color="primary" to="/">返回首页</v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
export default {
  name: "ExamEditorRemovedPage",
};
</script>
