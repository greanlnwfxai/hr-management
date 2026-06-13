import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectLeaveRequestDto {
  // Schema has no rejectReason field — accepted here for UX but not persisted.
  @ApiPropertyOptional({ example: 'Team already at capacity that week', maxLength: 500, description: 'Accepted for UX but not persisted in the database' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectReason?: string;
}
