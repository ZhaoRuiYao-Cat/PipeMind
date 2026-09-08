import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export interface FlowNodeDto {
  id: string;
  tool: string;
  params?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface FlowEdgeDto {
  id: string;
  source: string;
  target: string;
}

export class SaveFlowDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsObject()
  nodes!: Record<string, FlowNodeDto>;

  @IsObject()
  edges!: Record<string, FlowEdgeDto>;
}
