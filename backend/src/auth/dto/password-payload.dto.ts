import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PasswordPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  encryptedPassword!: string;
}
