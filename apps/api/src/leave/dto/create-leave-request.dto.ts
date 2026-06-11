import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { LeaveType } from '../../common/enums';

export class CreateLeaveRequestDto {
  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
