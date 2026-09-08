import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateUsernameDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: '用户名仅支持字母、数字、下划线与连字符',
  })
  username!: string;
}
