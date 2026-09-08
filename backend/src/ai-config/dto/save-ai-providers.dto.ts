import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class AiProviderItemDto {
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

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SaveAiProvidersDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AiProviderItemDto)
  providers!: AiProviderItemDto[];
}
