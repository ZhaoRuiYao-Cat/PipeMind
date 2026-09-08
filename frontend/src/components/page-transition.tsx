"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";

const FULLSCREEN_PATHS = ["/agent"];

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullscreen = FULLSCREEN_PATHS.includes(pathname);
  return (
    <Box
      key={pathname}
      className={fullscreen ? "pm-focus-fade" : "pm-page-focus"}
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </Box>
  );
}
