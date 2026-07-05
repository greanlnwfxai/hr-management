import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AttendanceNonceAction,
  AttendanceRiskLevel,
  AttendanceRiskResult,
  AttendanceRiskReviewStatus,
} from '../../common/enums';

export class QueryRiskReviewDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by employee UUID' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ enum: AttendanceRiskLevel, description: 'Filter by risk level' })
  @IsOptional()
  @IsEnum(AttendanceRiskLevel)
  riskLevel?: AttendanceRiskLevel;

  @ApiPropertyOptional({ enum: AttendanceRiskReviewStatus, description: 'Filter by review status' })
  @IsOptional()
  @IsEnum(AttendanceRiskReviewStatus)
  status?: AttendanceRiskReviewStatus;

  @ApiPropertyOptional({ enum: AttendanceNonceAction, description: 'Filter by attendance action' })
  @IsOptional()
  @IsEnum(AttendanceNonceAction)
  action?: AttendanceNonceAction;

  @ApiPropertyOptional({ enum: AttendanceRiskResult, description: 'Filter by underlying attempt result' })
  @IsOptional()
  @IsEnum(AttendanceRiskResult)
  result?: AttendanceRiskResult;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Filter from date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Filter to date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
