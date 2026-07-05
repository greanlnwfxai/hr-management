import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Body for the approve/reject convenience endpoints — administrative status
// tracking only, mirrors ApproveOffsiteDto/RejectOffsiteDto.
export class RiskReviewNoteDto {
  @ApiPropertyOptional({ example: 'Reviewed — no action needed.', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
