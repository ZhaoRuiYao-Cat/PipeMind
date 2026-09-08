import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace-shell";
import { PageTransition } from "@/components/page-transition";
import { ChatProvider } from "@/lib/chat";
import { AgentComposer } from "@/components/agent-composer";

export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ChatProvider>
      <WorkspaceShell>
        <PageTransition>{children}</PageTransition>
      </WorkspaceShell>
      <AgentComposer />
    </ChatProvider>
  );
}
