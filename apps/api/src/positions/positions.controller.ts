import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CreatePositionDto } from './dto/create-position.dto';
import { QueryPositionDto } from './dto/query-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PositionsService } from './positions.service';

@ApiTags('Positions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
@Controller('positions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PositionsController {
  constructor(private positions: PositionsService) {}

  @Get()
  @ApiOperation({ summary: 'List positions (paginated, filterable by department)' })
  @ApiResponse({ status: 200, description: 'Paginated position list' })
  findAll(@Query() query: QueryPositionDto) {
    return this.positions.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get position by ID' })
  @ApiParam({ name: 'id', description: 'Position UUID' })
  @ApiResponse({ status: 200, description: 'Position record' })
  @ApiResponse({ status: 404, description: 'Position not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.positions.findOne(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Create position (SUPER_ADMIN, HR_ADMIN)' })
  @ApiResponse({ status: 201, description: 'Position created' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  create(@Body() dto: CreatePositionDto) {
    return this.positions.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Update position (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Position UUID' })
  @ApiResponse({ status: 200, description: 'Position updated' })
  @ApiResponse({ status: 404, description: 'Position not found' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePositionDto) {
    return this.positions.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HR_ADMIN)
  @ApiOperation({ summary: 'Delete position — blocked if employees still hold it (SUPER_ADMIN, HR_ADMIN)' })
  @ApiParam({ name: 'id', description: 'Position UUID' })
  @ApiResponse({ status: 200, description: 'Position deleted' })
  @ApiResponse({ status: 404, description: 'Position not found' })
  @ApiResponse({ status: 409, description: 'Position is still assigned to employees' })
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.positions.remove(id);
  }
}
