import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVacationSetupDto {
  @ApiProperty({ description: 'Employee UUID' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ example: 2026, minimum: 2020, description: 'Calendar year' })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year: number;

  @ApiProperty({ example: 10, minimum: 0, description: 'Total entitled days (HR override or policy value)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  entitledDays: number;

  @ApiProperty({ example: 8, minimum: 0, description: 'Remaining days at time of setup' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  remainingDays: number;

  @ApiProperty({
    example: 'Employee transferred from branch; 2 days already used.',
    required: false,
    maxLength: 500,
    description: 'Optional setup note for audit trail',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(500)
  setupNote?: string;
}
