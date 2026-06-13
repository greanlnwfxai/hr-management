import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLeaveBalanceDto {
  // Maps to DB field `totalDays`.
  @ApiPropertyOptional({ example: 12, minimum: 0, description: 'Update total entitled days (stored as totalDays in DB)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  entitledDays?: number;

  @ApiPropertyOptional({ example: 3, minimum: 0, description: 'Override used days (manual adjustment)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  usedDays?: number;
}
