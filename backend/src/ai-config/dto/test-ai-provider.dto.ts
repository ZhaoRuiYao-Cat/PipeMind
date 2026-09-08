import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TestAiProviderDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  apiKey?: string;
}
