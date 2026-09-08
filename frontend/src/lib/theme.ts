import { createTheme } from "@mui/material/styles";

export const pmTheme = createTheme({
  palette: {
    primary: {
      main: "#1664ff",
      contrastText: "#ffffff",
    },
    text: {
      primary: "#1d2129",
      secondary: "#4e5969",
      disabled: "#c9cdd4",
    },
    divider: "#f2f3f5",
    background: {
      default: "#ffffff",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: "var(--pm-font-family)",
  },
  shape: { borderRadius: 12 },
});
