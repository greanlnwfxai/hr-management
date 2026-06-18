import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'admin',
    description: 'Username or email address. Takes precedence over the legacy `email` field.',
    required: false,
  })
  @IsOptional()
  @IsString()
  login?: string;

  @ApiProperty({
    example: 'admin@hr.local',
    description: 'Legacy field — treated as login identifier. Prefer `login`.',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ example: 'admin1234', writeOnly: true })
  @IsString()
  password: string;
}
