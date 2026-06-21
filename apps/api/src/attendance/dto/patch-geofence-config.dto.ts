import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class PatchGeofenceConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(10000)
  radiusMeters?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1000)
  maxAccuracyMeters?: number;
}
