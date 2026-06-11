import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateLeaveBalanceDto {
  // Maps to DB field `totalDays`.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  entitledDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  usedDays?: number;
}
