<template>
  <v-app-bar class="no-select">
    <v-app-bar-title>{{ titleText }}</v-app-bar-title>
    <v-spacer />
  </v-app-bar>

  <HomeSkeleton v-if="!dataReady" />

  <div v-else class="d-flex">
    <v-container class="main-window flex-grow-1 no-select bloom-container" fluid>
      <div v-if="sortedItems.length === 0" class="welcome-container">
        <div class="welcome-content">
          <div class="welcome-left">
            <v-icon color="primary" size="120" class="mb-6 welcome-icon">
              mdi-book-open-page-variant-outline
            </v-icon>
            <h1 class="text-h3 font-weight-bold mb-4 welcome-title">
              {{ isToday ? "今天还没有添加作业" : "这一天暂无作业记录" }}
            </h1>
            <p class="text-subtitle-1 text-grey welcome-description">
              点击右侧学科卡片开始添加作业内容<br>
              或使用底部工具栏切换日期查看其他日期的作业
            </p>
          </div>

          <div class="welcome-right">
            <div class="subjects-grid">
              <v-card
                v-for="subject in availableSubjects"
                :key="subject.name"
                :class="`subject-card subject-card-${subject.order % 5}`"
                border
                rounded="xl"
                @click="openDialog(subject.name)"
              >
                <v-card-text class="text-center pa-4">
                  <v-icon color="primary" size="32" class="mb-2">
                    mdi-plus-circle-outline
                  </v-icon>
                  <div class="text-subtitle-1 font-weight-medium">
                    {{ subject.name }}
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </div>
        </div>
      </div>

      <HomeworkGrid
        v-else
        :sorted-items="sortedItems"
        :unused-subjects="unusedSubjects"
        :empty-subject-display="'button'"
        :is-mobile="isMobile"
        :is-editing-disabled="false"
        :content-style="contentStyle"
        @open-dialog="openDialog"
      />
    </v-container>
  </div>

  <HomeworkEditDialog
    v-model="dialogVisible"
    :auto-save="true"
    :initial-content="textareaContent"
    :title="dialogTitle"
    @save="handleHomeworkSave"
  />

  <FloatingToolbar
    :is-today="isToday"
    :copy-to-today-loading="loading.copyToToday"
    :selected-date="selectedDateObj"
    :current-font-size="currentFontSizeValue"
    @zoom="zoom"
    @date-select="handleDateSelect"
    @prev-day="navigateDay(-1)"
    @next-day="navigateDay(1)"
    @copy-to-today="copyHomeworkToToday"
  />

  <FloatingICP />
</template>

<script>
import { defineAsyncComponent } from "vue";
import { useDisplay } from "vuetify";
import FloatingICP from "@/components/FloatingICP.vue";
import HomeSkeleton from "@/components/common/HomeSkeleton.vue";
import HomeworkGrid from "@/components/home/HomeworkGrid.vue";
import { getData, setData } from "@/utils/dataProvider";
import { getSetting, setSetting } from "@/utils/settings";

const FloatingToolbar = defineAsyncComponent(() => import("@/components/FloatingToolbar.vue"));
const HomeworkEditDialog = defineAsyncComponent(() => import("@/components/HomeworkEditDialog.vue"));

export default {
  name: "ClassworksBoard",
  components: {
    FloatingToolbar,
    FloatingICP,
    HomeworkEditDialog,
    HomeworkGrid,
    HomeSkeleton,
  },
  setup() {
    const { mobile } = useDisplay();
    return { mobile };
  },
  data() {
    return {
      dateString: "",
      selectedDateObj: new Date(),
      isToday: true,
      boardData: {
        homework: {},
      },
      dialogVisible: false,
      dialogTitle: "",
      textareaContent: "",
      currentEditSubject: "",
      loading: {
        copyToToday: false,
      },
      dataReady: false,
      fontSizeLevel: getSetting("display.fontSizeLevel") || 0,
      defaultSubjects: [
        { name: "语文", order: 0 },
        { name: "数学", order: 1 },
        { name: "英语", order: 2 },
        { name: "物理", order: 3 },
        { name: "化学", order: 4 },
        { name: "生物", order: 5 },
        { name: "政治", order: 6 },
        { name: "历史", order: 7 },
        { name: "地理", order: 8 },
        { name: "其他", order: 9 },
      ],
      availableSubjects: [],
    };
  },
  computed: {
    isMobile() {
      return this.mobile;
    },
    titleText() {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (this.dateString === this.formatDate(today)) {
        return "Classworks - 今天的作业";
      }

      if (this.dateString === this.formatDate(yesterday)) {
        return "Classworks - 昨天的作业";
      }

      return `Classworks - ${this.dateString} 的作业`;
    },
    sortedItems() {
      const items = [];

      for (const subject of this.availableSubjects) {
        const subjectData = this.boardData.homework[subject.name];
        if (subjectData?.content?.trim()) {
          items.push({
            key: subject.name,
            name: subject.name,
            type: "homework",
            content: subjectData.content,
            order: subject.order,
          });
        }
      }

      for (const [key, card] of Object.entries(this.boardData.homework)) {
        if (key.startsWith("custom-") && card?.content?.trim()) {
          items.push({
            key,
            name: card.name || "自定义",
            type: "custom",
            content: card.content,
            order: 9999,
          });
        }
      }

      return items.sort((a, b) => a.order - b.order);
    },
    unusedSubjects() {
      const usedKeys = new Set(
        Object.entries(this.boardData.homework)
          .filter(([, value]) => value?.content?.trim())
          .map(([key]) => key)
      );

      return this.availableSubjects
        .filter((subject) => !usedKeys.has(subject.name))
        .sort((a, b) => a.order - b.order);
    },
    contentStyle() {
      const size = Math.max(12, Math.min(32, 16 + this.fontSizeLevel));
      return {
        fontSize: `${size}px`,
      };
    },
    currentFontSizeValue() {
      return Math.max(12, Math.min(32, 16 + this.fontSizeLevel));
    },
  },
  async mounted() {
    try {
      await this.initializeData();
      this.dataReady = true;
    } catch (error) {
      console.error("初始化失败:", error);
    }
  },
  methods: {
    formatDate(dateInput) {
      const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}${month}${day}`;
    },
    async initializeData() {
      const urlParams = new URLSearchParams(window.location.search);
      const dateFromUrl = urlParams.get("date");
      const today = new Date();
      let currentDate = today;

      if (dateFromUrl && /^\d{8}$/.test(dateFromUrl)) {
        const year = dateFromUrl.slice(0, 4);
        const month = dateFromUrl.slice(4, 6);
        const day = dateFromUrl.slice(6, 8);
        currentDate = new Date(`${year}-${month}-${day}`);
      }

      this.dateString = this.formatDate(currentDate);
      this.selectedDateObj = currentDate;
      this.isToday = this.dateString === this.formatDate(today);

      await Promise.all([this.downloadData(), this.loadConfig()]);
    },
    async downloadData() {
      try {
        const dataKey = `classworks-data-${this.dateString}`;
        const response = await getData(dataKey);
        this.boardData = {
          homework: response?.homework || {},
        };
      } catch (error) {
        console.error("加载数据失败:", error);
        this.boardData = { homework: {} };
      }
    },
    async uploadData() {
      const dataKey = `classworks-data-${this.dateString}`;
      await setData(dataKey, this.boardData);
    },
    async loadConfig() {
      try {
        const subjectsResponse = await getData("classworks-config-subject");
        this.availableSubjects = Array.isArray(subjectsResponse)
          ? subjectsResponse
          : [...this.defaultSubjects];
      } catch (error) {
        console.warn("加载学科配置失败:", error);
        this.availableSubjects = [...this.defaultSubjects];
      }
    },
    openDialog(subject) {
      this.currentEditSubject = subject;

      if (!this.boardData.homework[subject]) {
        this.boardData.homework[subject] = { content: "" };
      }

      const card = this.boardData.homework[subject];
      this.dialogTitle = card.name || this.availableSubjects.find((item) => item.name === subject)?.name || subject;
      this.textareaContent = card.content || "";
      this.dialogVisible = true;
    },
    async handleHomeworkSave(content) {
      if (!this.currentEditSubject) {
        return;
      }

      const existing = this.boardData.homework[this.currentEditSubject] || {};
      this.boardData.homework[this.currentEditSubject] = {
        ...existing,
        content,
      };

      if (!content.trim() && !this.currentEditSubject.startsWith("custom-")) {
        delete this.boardData.homework[this.currentEditSubject];
      }

      await this.uploadData();
    },
    zoom(direction) {
      if (direction === "up") {
        this.fontSizeLevel = Math.min(this.fontSizeLevel + 1, 16);
      } else if (direction === "out") {
        this.fontSizeLevel = Math.max(this.fontSizeLevel - 1, -4);
      }

      setSetting("display.fontSizeLevel", this.fontSizeLevel);
    },
    async handleDateSelect(dateValue) {
      if (!dateValue) {
        return;
      }

      const selectedDate = new Date(dateValue);
      const nextDateString = this.formatDate(selectedDate);

      if (nextDateString === this.dateString) {
        return;
      }

      this.dateString = nextDateString;
      this.selectedDateObj = selectedDate;
      this.isToday = nextDateString === this.formatDate(new Date());
      await this.downloadData();
    },
    navigateDay(offset) {
      const currentDate = new Date(this.selectedDateObj);
      currentDate.setDate(currentDate.getDate() + offset);
      this.handleDateSelect(currentDate);
    },
    async copyHomeworkToToday() {
      if (this.loading.copyToToday) {
        return;
      }

      this.loading.copyToToday = true;

      try {
        const sourceHomework = JSON.parse(JSON.stringify(this.boardData.homework));
        const today = new Date();
        this.dateString = this.formatDate(today);
        this.selectedDateObj = today;
        this.isToday = true;

        const nextHomework = {};
        for (const [key, value] of Object.entries(sourceHomework)) {
          if (value?.content?.trim()) {
            nextHomework[key] = { ...value };
          }
        }

        this.boardData.homework = nextHomework;
        await this.uploadData();
      } catch (error) {
        console.error("复制作业到今天失败:", error);
      } finally {
        this.loading.copyToToday = false;
      }
    },
  },
};
</script>

<style scoped>
.welcome-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 200px);
  padding: 40px 20px;
}

.welcome-content {
  display: flex;
  gap: 60px;
  max-width: 1200px;
  width: 100%;
  align-items: center;
}

.welcome-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.welcome-icon {
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-10px);
  }
}

.welcome-title {
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)) 0%, rgb(var(--v-theme-secondary)) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-description {
  line-height: 1.8;
  opacity: 0.8;
}

.welcome-right {
  flex: 1.5;
}

.subjects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

.subject-card {
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.subject-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
  border-color: rgba(var(--v-theme-primary), 0.2);
}

@media (max-width: 960px) {
  .welcome-content {
    flex-direction: column;
    gap: 40px;
  }

  .welcome-left,
  .welcome-right {
    width: 100%;
  }
}

@media (max-width: 600px) {
  .welcome-container {
    min-height: calc(100vh - 150px);
    padding: 20px 16px;
  }

  .subjects-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
  }
}
</style>
