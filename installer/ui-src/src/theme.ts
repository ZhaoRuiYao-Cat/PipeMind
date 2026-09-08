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
    // 输入框全圆角胶囊形
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 999 },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
  },
});
