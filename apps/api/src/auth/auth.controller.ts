import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
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
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
    schema: { example: { id: 'uuid', email: 'admin@hr.local', role: 'SUPER_ADMIN' } },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  me(@CurrentUser() user: Express.User) {
    return user;
  }
}
