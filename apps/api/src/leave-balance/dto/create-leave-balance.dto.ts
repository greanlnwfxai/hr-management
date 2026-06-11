import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsUUID, Min } from 'class-validator';
import { LeaveType } from '../../common/enums';

export class CreateLeaveBalanceDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year: number;

  // Maps to DB field `totalDays` — represents the full quota for the period.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  entitledDays: number;
}
