import { IsBoolean } from 'class-validator';

export class SetSharedDto {
  @IsBoolean()
  shared!: boolean;
}
