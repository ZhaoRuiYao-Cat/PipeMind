import { IsObject, IsOptional } from 'class-validator';
import type { FlowEdgeDto, FlowNodeDto } from './save-flow.dto.js';

export class RunFlowDto {
  @IsObject()
  nodes!: Record<string, FlowNodeDto>;

  @IsOptional()
  @IsObject()
  edges!: Record<string, FlowEdgeDto>;
}
