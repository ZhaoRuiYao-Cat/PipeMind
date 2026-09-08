"use client";

import { ThemeProvider } from "@mui/material/styles";
import Box from "@mui/material/Box";
import { pmTheme } from "@/lib/theme";
import { HomeScene } from "@/components/home-scene";
import { HomeSceneHint } from "@/components/home-scene-hint";
import { GisSourcePicker } from "@/components/gis-source-picker";

export default function HomePage() {
  return (
    <ThemeProvider theme={pmTheme}>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <HomeScene />
        <HomeSceneHint />
        <Box
          sx={{
            position: "absolute",
            top: { xs: 66, sm: 72 },
            right: { xs: 16, sm: 32 },
            zIndex: 1100,
          }}
        >
          <GisSourcePicker />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
