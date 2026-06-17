import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ClockInDto {
  @ApiPropertyOptional({ example: 'Working from home today', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    enum: ['web', 'mobile'],
    description: 'Request source. Mobile source triggers geofence validation.',
  })
  @IsOptional()
  @IsIn(['web', 'mobile'])
  source?: 'web' | 'mobile';

  @ApiPropertyOptional({ example: 13.7563, description: 'GPS latitude (-90 to 90)' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional({ example: 100.5018, description: 'GPS longitude (-180 to 180)' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional({ example: 25, description: 'GPS accuracy radius in meters (must be > 0)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  accuracy?: number;
}
