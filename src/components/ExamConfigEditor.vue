<template>
  <div class="exam-editor">
    <v-alert
      v-if="error"
      class="mb-4"
      type="error"
      variant="tonal"
      closable
      @click:close="error = ''"
    >
      {{ error }}
    </v-alert>

    <v-alert
      v-if="success"
      class="mb-4"
      type="success"
      variant="tonal"
      closable
      @click:close="success = ''"
    >
      {{ success }}
    </v-alert>

    <div class="actions">
      <v-btn
        color="primary"
        prepend-icon="mdi-content-copy"
        variant="outlined"
        @click="copyToClipboard"
      >
        复制 JSON
      </v-btn>
      <v-btn
        color="primary"
        prepend-icon="mdi-download"
        variant="outlined"
        @click="downloadAsJson"
      >
        下载 JSON
      </v-btn>
      <v-btn
        color="primary"
        prepend-icon="mdi-download"
        variant="outlined"
        @click="downloadAsEa2"
      >
        下载 EA2
      </v-btn>
      <v-btn
        color="warning"
        prepend-icon="mdi-alert-circle-outline"
        variant="outlined"
        @click="copyConfigUrl"
      >
        云端链接不可用
      </v-btn>
      <v-btn
        color="secondary"
        prepend-icon="mdi-play-circle"
        variant="outlined"
        @click="openInEa2Player"
      >
        拉起 EA2
      </v-btn>
      <v-spacer />
      <v-btn
        color="error"
        prepend-icon="mdi-delete"
        variant="tonal"
        :loading="deleting"
        @click="deleteConfig"
      >
        删除配置
      </v-btn>
    </div>

    <v-card border class="mb-4">
      <v-card-title>基本信息</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="localConfig.examName"
              label="考试名称"
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="localConfig.room"
              label="考场"
              variant="outlined"
            />
          </v-col>
        </v-row>
        <v-textarea
          v-model="localConfig.message"
          label="提醒语"
          rows="3"
          variant="outlined"
        />
      </v-card-text>
    </v-card>

    <v-card border>
      <v-card-title class="d-flex align-center">
        考试安排
        <v-spacer />
        <v-btn
          color="success"
          prepend-icon="mdi-plus"
          size="small"
          @click="addExamInfo"
        >
          添加科目
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-card
          v-for="(examInfo, index) in localConfig.examInfos"
          :key="`${configId}-${index}`"
          class="mb-4"
          variant="outlined"
        >
          <v-card-text>
            <div class="exam-row-header">
              <div class="text-subtitle-1 font-weight-bold">
                第 {{ index + 1 }} 场
              </div>
              <div class="d-flex ga-1">
                <v-btn
                  icon="mdi-arrow-up"
                  size="x-small"
                  variant="text"
                  :disabled="index === 0"
                  @click="moveExamInfo(index, -1)"
                />
                <v-btn
                  icon="mdi-arrow-down"
                  size="x-small"
                  variant="text"
                  :disabled="index === localConfig.examInfos.length - 1"
                  @click="moveExamInfo(index, 1)"
                />
                <v-btn
                  icon="mdi-delete"
                  size="x-small"
                  variant="text"
                  color="error"
                  @click="removeExamInfo(index)"
                />
              </div>
            </div>

            <v-row>
              <v-col cols="12" md="4">
                <v-text-field
                  v-model="examInfo.name"
                  label="科目"
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12" md="3">
                <v-text-field
                  v-model="examInfo.start"
                  label="开始时间"
                  placeholder="2025-01-01 09:00:00"
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12" md="3">
                <v-text-field
                  v-model="examInfo.end"
                  label="结束时间"
                  placeholder="2025-01-01 11:00:00"
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12" md="2">
                <v-text-field
                  v-model.number="examInfo.alertTime"
                  label="提醒(分)"
                  type="number"
                  variant="outlined"
                />
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <div
          v-if="!localConfig.examInfos.length"
          class="empty-state"
        >
          暂无考试科目，请添加一场考试。
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script>
import { getData, setData, deleteData } from "@/utils/dataProvider";

function createExamInfo(offsetDays = 0) {
  const start = new Date();
  start.setDate(start.getDate() + offsetDays);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const format = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:00`;
  };

  return {
    name: "",
    start: format(start),
    end: format(end),
    alertTime: 15,
  };
}

export default {
  name: "ExamConfigEditor",
  props: {
    configId: { type: String, required: true },
    dialogMode: { type: Boolean, default: false },
  },
  emits: ["saved", "deleted", "error", "opened"],
  data() {
    return {
      loading: false,
      deleting: false,
      error: "",
      success: "",
      localConfig: {
        examName: "",
        message: "",
        room: "",
        examInfos: [],
      },
    };
  },
  computed: {
    formattedStorageJson() {
      return JSON.stringify(this.getSanitizedConfig(), null, 2);
    },
  },
  async mounted() {
    await this.loadConfig();
  },
  methods: {
    getSanitizedConfig() {
      return {
        examName: this.localConfig.examName.trim(),
        message: this.localConfig.message.trim(),
        room: this.localConfig.room.trim(),
        examInfos: this.localConfig.examInfos.map((item) => ({
          name: (item.name || "").trim(),
          start: (item.start || "").trim(),
          end: (item.end || "").trim(),
          alertTime: Number(item.alertTime) || 15,
        })),
      };
    },
    validateConfig() {
      const config = this.getSanitizedConfig();

      if (!config.examName) {
        throw new Error("请填写考试名称");
      }
      if (!config.message) {
        throw new Error("请填写提醒语");
      }
      if (!config.examInfos.length) {
        throw new Error("请至少添加一场考试");
      }

      for (const [index, item] of config.examInfos.entries()) {
        if (!item.name || !item.start || !item.end) {
          throw new Error(`第 ${index + 1} 场考试信息不完整`);
        }
      }

      return config;
    },
    async loadConfig() {
      this.loading = true;
      this.error = "";

      try {
        const response = await getData(`es_${this.configId}`);
        if (response) {
          this.localConfig = {
            examName: response.examName || "",
            message: response.message || "",
            room: response.room || "",
            examInfos: Array.isArray(response.examInfos) ? response.examInfos : [],
          };
        } else {
          this.localConfig.examInfos = [createExamInfo()];
        }
      } catch (error) {
        this.error = `加载配置失败: ${error.message}`;
        this.$emit("error", this.error);
      } finally {
        this.loading = false;
      }
    },
    async saveConfig() {
      try {
        const config = this.validateConfig();
        await setData(`es_${this.configId}`, config);
        this.success = "配置保存成功";
        this.$emit("saved", config);
        return true;
      } catch (error) {
        this.error = error.message;
        this.$emit("error", this.error);
        return false;
      }
    },
    addExamInfo() {
      this.localConfig.examInfos.push(createExamInfo(this.localConfig.examInfos.length));
    },
    removeExamInfo(index) {
      this.localConfig.examInfos.splice(index, 1);
    },
    moveExamInfo(index, offset) {
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= this.localConfig.examInfos.length) return;
      const [item] = this.localConfig.examInfos.splice(index, 1);
      this.localConfig.examInfos.splice(targetIndex, 0, item);
    },
    async copyToClipboard() {
      try {
        await navigator.clipboard.writeText(this.formattedStorageJson);
        this.success = "配置已复制到剪贴板";
      } catch (error) {
        this.error = `复制失败: ${error.message}`;
      }
    },
    downloadAsJson() {
      this.downloadFile("json", "application/json");
      this.success = "已下载 JSON 文件";
    },
    downloadAsEa2() {
      this.downloadFile("ea2", "application/json");
      this.success = "已下载 EA2 文件";
    },
    downloadFile(extension, mimeType) {
      const blob = new Blob([this.formattedStorageJson], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${this.localConfig.examName || "exam-config"}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    copyConfigUrl() {
      this.error = "本地存储模式不支持云端地址功能";
    },
    async deleteConfig() {
      this.deleting = true;

      try {
        await deleteData(`es_${this.configId}`);
        const list = (await getData("es_list")) || [];
        const nextList = list.filter((item) => item.id !== this.configId);
        await setData("es_list", nextList);
        this.$emit("deleted", {
          success: true,
          message: "配置删除成功",
          configId: this.configId,
        });
      } catch (error) {
        this.$emit("deleted", {
          success: false,
          message: `删除失败: ${error.message}`,
        });
      } finally {
        this.deleting = false;
      }
    },
    openInEa2Player() {
      try {
        const data = btoa(unescape(encodeURIComponent(this.formattedStorageJson)));
        window.location.href = `examaware://player?data=${encodeURIComponent(data)}`;
        this.success = "正在尝试拉起 ExamAware2 播放器";
      } catch (error) {
        this.error = `拉起播放器失败: ${error.message}`;
      }
    },
  },
};
</script>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.exam-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.empty-state {
  padding: 24px 0;
  text-align: center;
  color: rgb(var(--v-theme-medium-emphasis));
}
</style>
