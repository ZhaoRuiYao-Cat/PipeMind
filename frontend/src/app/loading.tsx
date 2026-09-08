"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

export default function Loading() {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--pm-color-page-bg)",
      }}
    >
      <CircularProgress
        size={48}
        thickness={4}
        sx={{ color: "var(--pm-color-primary)" }}
      />
    </Box>
  );
}
