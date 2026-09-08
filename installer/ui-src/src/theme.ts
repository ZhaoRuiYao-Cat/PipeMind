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
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
  },
});
