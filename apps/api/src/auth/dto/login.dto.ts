import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@hr.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin1234', writeOnly: true })
  @IsString()
  password: string;
}
