import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryVacationSetupDto {
  @ApiProperty({ description: 'Employee UUID' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ example: 2026, minimum: 2020, description: 'Calendar year' })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year: number;
}
