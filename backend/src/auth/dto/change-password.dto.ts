import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  encryptedOldPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  encryptedNewPassword!: string;
}
