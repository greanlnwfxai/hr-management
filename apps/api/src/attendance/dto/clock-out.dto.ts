import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ClockOutDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
