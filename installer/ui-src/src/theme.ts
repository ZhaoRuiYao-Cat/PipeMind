import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    primary: { main: "#1664ff" },
    secondary: { main: "#6b7280" },
    background: { default: "#f5f7fa" },
    error: { main: "#cf1322" },
    success: { main: "#0a8a5f" },
    warning: { main: "#b25e09" },
  },
  // 常规组件（卡片/提示框等）保持适中圆角；仅按钮与输入框单独做全圆角
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: [
      "-apple-system",
      "BlinkMacSystemFont",
      '"Segoe UI"',
      '"PingFang SC"',
      '"Microsoft YaHei"',
      "Roboto",
      "sans-serif",
    ].join(","),
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 999,
          textTransform: "none",
          fontWeight: 600,
          fontSize: 14,
          minWidth: 96,
        },
        // 中/大按钮等高，配合"下一步/上一步/一键安装"同样大小
        sizeMedium: { height: 44, paddingInline: 26 },
        sizeLarge: { height: 44, paddingInline: 30 },
        sizeSmall: { height: 36, paddingInline: 16, fontSize: 13 },
      },
    },
    // 常规单行输入框全圆角胶囊形；多行输入框（如密钥 PEM 粘贴框）用小圆角
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ ownerState }) => ({
          borderRadius: ownerState?.multiline ? 10 : 999,
        }),
      },
    },
    // iOS 风格开关（主题蓝不变）
    MuiSwitch: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          width: 42,
          height: 26,
          padding: 0,
          margin: 2,
        },
        switchBase: {
          padding: 3,
          color: "#fff",
          "&:hover": { backgroundColor: "transparent" },
          "&.Mui-checked": {
            transform: "translateX(16px)",
            color: "#fff",
            "& + .MuiSwitch-track": {
              backgroundColor: "#1664ff",
              borderColor: "#1664ff",
              opacity: 1,
            },
          },
          "&.Mui-disabled + .MuiSwitch-track": { opacity: 0.45 },
        },
        thumb: {
          width: 20,
          height: 20,
          boxShadow: "0 2px 4px 0 rgb(0 35 11 / 0.25)",
        },
        track: {
          borderRadius: 13,
          border: "1px solid #d0d5db",
          backgroundColor: "#e9e9ea",
          opacity: 1,
          boxSizing: "border-box",
        },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
  },
});
