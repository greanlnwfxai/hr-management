import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ClockInDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
