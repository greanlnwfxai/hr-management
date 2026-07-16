import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums';
import { ApproveOffSiteRequestDto } from './dto/approve-off-site-request.dto';
import { CreateOffSiteRequestDto } from './dto/create-off-site-request.dto';
import { QueryOffSiteRequestDto } from './dto/query-off-site-request.dto';
import { RejectOffSiteRequestDto } from './dto/reject-off-site-request.dto';
import { OffSiteService } from './off-site.service';

@ApiTags('Off-Site Requests')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('off-site')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OffSiteController {
  constructor(private offSite: OffSiteService) {}

  @Post('request')
  @ApiOperation({ summary: 'Submit an off-site work request' })
  @ApiResponse({ status: 201, description: 'Off-site request created' })
  @ApiResponse({ status: 409, description: 'Overlapping PENDING/APPROVED request exists' })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateOffSiteRequestDto,
  ) {
    return this.offSite.create(user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Own off-site requests (paginated)' })
  findMy(
    @CurrentUser() user: { id: string },
    @Query() query: QueryOffSiteRequestDto,
  ) {
    return this.offSite.findMy(user.id, query);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'All off-site requests (SUPER_ADMIN, HR_ADMIN, MANAGER — MANAGER scoped to managed department)' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  findAll(
    @Query() query: QueryOffSiteRequestDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.offSite.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get off-site request by ID (owner or admin)' })
  @ApiParam({ name: 'id', description: 'Off-site request UUID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.offSite.findOne(id, user.id, user.role);
  }

  @Patch(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Approve a PENDING off-site request' })
  @ApiParam({ name: 'id', description: 'Off-site request UUID' })
  @ApiForbiddenResponse({ description: 'Insufficient role or wrong department' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: ApproveOffSiteRequestDto,
    @Req() req: Request,
  ) {
    return this.offSite.approve(id, user.id, user.role, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }

  @Patch(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Reject a PENDING off-site request' })
  @ApiParam({ name: 'id', description: 'Off-site request UUID' })
  @ApiForbiddenResponse({ description: 'Insufficient role or wrong department' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: RejectOffSiteRequestDto,
    @Req() req: Request,
  ) {
    return this.offSite.reject(id, user.id, user.role, dto, {
      actorUserId: user.id,
      actorRole: user.role,
      ipAddress: req?.ip ?? null,
      userAgent: (req?.headers?.['user-agent'] as string) ?? null,
    });
  }
}
