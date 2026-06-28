import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { CreateVacationSetupDto } from './dto/create-vacation-setup.dto';
import { QueryVacationSetupDto } from './dto/query-vacation-setup.dto';
import { VacationSetupService } from './vacation-setup.service';

@ApiTags('Vacation Setup')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('leave-balances/vacation-setup')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VacationSetupController {
  constructor(private vacationSetup: VacationSetupService) {}

  @Get('suggest')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({
    summary: 'Get suggested vacation entitlement for an employee (SUPER_ADMIN, HR_ADMIN)',
  })
  @ApiResponse({ status: 200, description: 'Suggestion calculated from hireDate' })
  @ApiResponse({ status: 400, description: 'Employee has no hireDate' })
  @ApiResponse({ status: 404, description: 'Employee not found' })
  @ApiResponse({ status: 422, description: 'Year is in the future' })
  @ApiForbiddenResponse({ description: 'Insufficient role (MANAGER and EMPLOYEE rejected)' })
  suggest(@Query() query: QueryVacationSetupDto) {
    return this.vacationSetup.suggest(query);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({
    summary: 'Manually set up vacation leave balance for an employee (SUPER_ADMIN, HR_ADMIN)',
  })
  @ApiResponse({ status: 201, description: 'Vacation balance created' })
  @ApiResponse({ status: 400, description: 'Employee not found or no hireDate' })
  @ApiResponse({ status: 409, description: 'VACATION balance already exists for this employee/year' })
  @ApiResponse({ status: 422, description: 'Ineligible (< 1 year tenure), remainingDays > entitledDays, or future year' })
  @ApiForbiddenResponse({ description: 'Insufficient role (MANAGER and EMPLOYEE rejected)' })
  setup(
    @Body() dto: CreateVacationSetupDto,
    @CurrentUser() user: { id: string; role: string },
    @Req() req: Request,
  ) {
    return this.vacationSetup.setup(dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
