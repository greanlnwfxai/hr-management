import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectLeaveRequestDto {
  // Schema has no rejectReason field — accepted here for UX but not persisted.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectReason?: string;
}
