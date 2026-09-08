"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { FlowBuilder } from "@/components/flow-builder";

export default function AgentPage() {
  return (
    <ReactFlowProvider>
      <FlowBuilder />
    </ReactFlowProvider>
  );
}
