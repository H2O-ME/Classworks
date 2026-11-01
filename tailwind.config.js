import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  // 只扫前端源码：产物里不该出现未用到的类
  content: ["./index.html", "./src/**/*.{vue,js,mjs}"],
  // <Transition> 标签名本身会被当成类名候选，产出没人用的 `.transition` 工具类
  // （其 transition-property 里含 backdrop-filter，会被"禁止 backdrop-filter"的静态检查误报）
  blocklist: ["transition"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "PingFang SC", "Microsoft YaHei", "sans-serif"],
      },
    },
  },
  plugins: [animate],
  // 硬约束：希沃弱核显上模糊/背景模糊是掉帧根因。直接从生成器里摘掉这类工具类，
  // 比"每个文件记得别用 blur-*"可靠——写了也不会产出 CSS。
  corePlugins: {
    filter: false,
    blur: false,
    brightness: false,
    contrast: false,
    dropShadow: false,
    grayscale: false,
    hueRotate: false,
    invert: false,
    saturate: false,
    sepia: false,
    backdropBlur: false,
    backdropBrightness: false,
    backdropContrast: false,
    backdropGrayscale: false,
    backdropHueRotate: false,
    backdropInvert: false,
    backdropOpacity: false,
    backdropSaturate: false,
    backdropSepia: false,
  },
};
