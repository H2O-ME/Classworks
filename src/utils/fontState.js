import { getCurrentFont, getFontsByCategory, onFontChange, setFont } from "./fonts";

const FONT_CATEGORY_LABELS = {
  system: "系统",
  modern: "现代",
  serif: "衬线",
  mono: "等宽",
};

export function getFontToolbarState() {
  const currentFont = getCurrentFont();
  return {
    currentFontId: currentFont.id,
    currentFontName: currentFont.name,
    fontCategories: getFontsByCategory(),
  };
}

export function watchFontToolbarState(callback) {
  return onFontChange((font) => {
    callback({
      currentFontId: font.id,
      currentFontName: font.name,
      fontCategories: getFontsByCategory(),
    });
  });
}

export function getFontCategoryLabel(category) {
  return FONT_CATEGORY_LABELS[category] || category;
}

export async function applyFontSelection(fontId) {
  await setFont(fontId);
}
