import {
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
  MaxLength,
  IsPositive,
} from 'class-validator';

export class OffsiteClockOutDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber()
  @IsPositive()
  @Max(100)
  accuracy: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
