const DEFAULT_SUBJECTS = [
  { name: "语文", order: 0 },
  { name: "数学", order: 1 },
  { name: "英语", order: 2 },
  { name: "物理", order: 3 },
  { name: "化学", order: 4 },
  { name: "地理", order: 5 },
];

export function getDefaultSubjects() {
  return DEFAULT_SUBJECTS.map((subject) => ({ ...subject }));
}

export function formatDateKey(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function normalizeBoardData(data) {
  return {
    homework: isPlainObject(data?.homework) ? data.homework : {},
  };
}

export function resolveAvailableSubjects(subjectConfig) {
  if (!Array.isArray(subjectConfig) || !subjectConfig.length) {
    return getDefaultSubjects();
  }

  const defaultSubjects = getDefaultSubjects();
  const allowedSubjects = new Set(defaultSubjects.map((subject) => subject.name));
  const orderMap = new Map(defaultSubjects.map((subject) => [subject.name, subject.order]));

  const filteredSubjects = subjectConfig
    .filter((subject) => allowedSubjects.has(subject.name))
    .map((subject) => ({
      ...subject,
      order: orderMap.get(subject.name) ?? 999,
    }))
    .sort((a, b) => a.order - b.order);

  return filteredSubjects.length ? filteredSubjects : defaultSubjects;
}

export function getSortedHomeworkItems(boardData, availableSubjects) {
  const items = [];
  const homework = normalizeBoardData(boardData).homework;

  for (const subject of availableSubjects) {
    const subjectData = homework[subject.name];
    if (subjectData?.content?.trim()) {
      items.push({
        key: subject.name,
        name: subject.name,
        type: "homework",
        content: subjectData.content,
        options: subjectData.options || {},
        order: subject.order,
      });
    }
  }

  for (const [key, value] of Object.entries(homework)) {
    if (key.startsWith("custom-") && value?.content?.trim()) {
      items.push({
        key,
        name: value.name || "自定义",
        type: "custom",
        content: value.content,
        options: value.options || {},
        order: 1000,
      });
    }
  }

  return items.sort((a, b) => a.order - b.order);
}

export function getUnusedSubjects(boardData, availableSubjects) {
  const homework = normalizeBoardData(boardData).homework;
  const usedKeys = new Set(
    Object.entries(homework)
      .filter(([, value]) => value?.content?.trim())
      .map(([key]) => key),
  );

  return availableSubjects.filter((subject) => !usedKeys.has(subject.name));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
