import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
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

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(-720)
  @Max(840)
  timezoneOffsetMinutes?: number;

  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: 'ios' | 'android' | 'web';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nonce?: string;

  @IsOptional()
  @IsBoolean()
  isMockLocation?: boolean;
}
