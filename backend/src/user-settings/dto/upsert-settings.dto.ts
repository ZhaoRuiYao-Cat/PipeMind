import { IsObject } from 'class-validator';

export class UpsertSettingsDto {
  @IsObject()
  values!: Record<string, unknown>;
}
