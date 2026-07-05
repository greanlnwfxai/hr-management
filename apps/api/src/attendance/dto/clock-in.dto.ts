import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WorkMode } from '../../common/enums';

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

  @ApiPropertyOptional({ enum: WorkMode, description: 'OFFSITE bypasses geofence radius (requires an approved off-site request for today)' })
  @IsOptional()
  @IsEnum(WorkMode)
  workMode?: WorkMode;

  @ApiPropertyOptional({
    example: '2026-07-05T09:14:32.000Z',
    description: 'ISO-8601 timestamp of when the client captured the GPS fix. Optional for backward compatibility with older mobile builds; used server-side only for freshness signals, never persisted.',
  })
  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @ApiPropertyOptional({ example: 420, description: "Client's local timezone offset from UTC, in minutes (e.g. Bangkok UTC+7 = 420)" })
  @IsOptional()
  @IsInt()
  @Min(-720)
  @Max(840)
  @Type(() => Number)
  timezoneOffsetMinutes?: number;

  @ApiPropertyOptional({ enum: ['ios', 'android', 'web'], description: 'Client runtime platform, for diagnostic/risk-signal purposes only' })
  @IsOptional()
  @IsIn(['ios', 'android', 'web'])
  platform?: 'ios' | 'android' | 'web';

  @ApiPropertyOptional({
    description: 'SEC-ATT-004 replay-protection nonce, obtained from POST /attendance/nonce (action: CLOCK_IN) immediately before submitting. If present, must be valid, unexpired, unused, and issued for CLOCK_IN by this user, or the request is rejected. Missing nonce is currently soft-enforced (accepted, audited) for rollout compatibility.',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  nonce?: string;

  @ApiPropertyOptional({
    description: 'SEC-ATT-003: set true only when the client platform itself reports the GPS fix as mocked/simulated (e.g. a future native build’s mock-location flag). The current PWA has no such signal and never sets this field. When present and true, the backend rejects the request.',
  })
  @IsOptional()
  @IsBoolean()
  isMockLocation?: boolean;
}
