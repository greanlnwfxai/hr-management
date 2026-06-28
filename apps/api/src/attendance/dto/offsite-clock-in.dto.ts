import {
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsPositive,
} from 'class-validator';

export class OffsiteClockInDto {
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

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  workLocationName: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
