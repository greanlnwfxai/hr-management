import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      ttl: parseInt(process.env.LOGIN_THROTTLE_TTL ?? '60') * 1000,
      limit: parseInt(process.env.LOGIN_THROTTLE_LIMIT ?? '5'),
    },
  })
  @ApiOperation({ summary: 'Authenticate and receive JWT' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: { example: { accessToken: 'eyJ...', user: { id: 'uuid', email: 'admin@hr.local', role: 'SUPER_ADMIN' } } },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile with employee details',
    schema: {
      example: {
        id: 'uuid',
        email: 'admin@hr.local',
        username: 'admin',
        role: 'SUPER_ADMIN',
        mustChangePassword: false,
        employeeId: 'emp-uuid',
        employee: { id: 'emp-uuid', firstName: 'John', lastName: 'Doe', employeeCode: 'EMP001', department: 'IT', position: 'Developer' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  me(@CurrentUser() user: Express.User) {
    return this.auth.getMe((user as { id: string }).id);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully', schema: { example: { success: true, mustChangePassword: false } } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT, or wrong current password' })
  @ApiResponse({ status: 400, description: 'Validation error or passwords do not match' })
  changePassword(
    @CurrentUser() user: Express.User,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword((user as { id: string }).id, dto);
  }
}
