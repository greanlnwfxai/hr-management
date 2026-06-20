import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../common/enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'All audit logs — paginated and filterable (SUPER_ADMIN, HR_ADMIN)' })
  @ApiResponse({ status: 200, description: 'Paginated audit log list' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  findAll(@Query() query: QueryAuditLogDto) {
    return this.auditLog.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single audit log by ID (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Audit log UUID' })
  @ApiResponse({ status: 200, description: 'Audit log record' })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditLog.findOne(id);
  }
}
