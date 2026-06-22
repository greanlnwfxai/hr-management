import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectOffSiteRequestDto {
  @ApiPropertyOptional({ example: 'ไม่อนุมัติเนื่องจากมีงานในออฟฟิศ', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectReason?: string;
}
