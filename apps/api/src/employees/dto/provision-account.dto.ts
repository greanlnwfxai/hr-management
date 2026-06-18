import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../common/enums';

export class ProvisionAccountDto {
  @ApiProperty({ example: 'j.pichai', description: 'Username: lowercase a-z 0-9 . _ - only' })
  @IsString()
  @Matches(/^[a-z0-9._-]+$/, { message: 'username must contain only lowercase letters, digits, dots, underscores, or hyphens' })
  username: string;

  @ApiProperty({ enum: UserRole, default: UserRole.EMPLOYEE })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ example: 'pichai.j@company.com', required: false })
  @IsOptional()
  @IsString()
  email?: string;
}
