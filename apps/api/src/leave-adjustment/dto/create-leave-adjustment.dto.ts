import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, MinLength, NotEquals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLeaveAdjustmentDto {
  @ApiProperty({
    example: -0.5,
    description: 'Signed delta in days (positive = add, negative = remove). Must be non-zero.',
  })
  @Type(() => Number)
  @IsNumber()
  @NotEquals(0, { message: 'deltaDays must be non-zero' })
  deltaDays: number;

  @ApiProperty({
    example: 'Correcting data entry error from 2026-06-01',
    minLength: 5,
    description: 'Mandatory reason for the adjustment (min 5 characters).',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'reason must not be empty' })
  @MinLength(5, { message: 'reason must be at least 5 characters' })
  reason: string;
}
