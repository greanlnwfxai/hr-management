import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceRiskReviewStatus } from '../../common/enums';

export class ReviewRiskReviewDto {
  @ApiProperty({
    enum: AttendanceRiskReviewStatus,
    description: 'New review status for this risk review row (administrative status tracking only).',
  })
  @IsEnum(AttendanceRiskReviewStatus)
  status: AttendanceRiskReviewStatus;

  @ApiPropertyOptional({ example: 'Confirmed with employee — GPS delay, not spoofing.', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
