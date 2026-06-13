import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LeaveType } from '../../common/enums';

export class CreateLeaveBalanceDto {
  @ApiProperty({ description: 'Employee UUID' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ enum: LeaveType })
  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @ApiProperty({ example: 2024, minimum: 2020, description: 'Calendar year' })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year: number;

  // Maps to DB field `totalDays` — represents the full quota for the period.
  @ApiProperty({ example: 10, minimum: 0, description: 'Total entitled days (stored as totalDays in DB)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  entitledDays: number;
}
