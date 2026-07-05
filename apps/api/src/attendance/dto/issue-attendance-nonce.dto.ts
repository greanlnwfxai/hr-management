import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AttendanceNonceAction } from '../../common/enums';

export class IssueAttendanceNonceDto {
  @ApiProperty({
    enum: AttendanceNonceAction,
    description: 'The attendance action this nonce will be used for. Must match the action sent on the follow-up clock request.',
  })
  @IsEnum(AttendanceNonceAction)
  action: AttendanceNonceAction;
}
