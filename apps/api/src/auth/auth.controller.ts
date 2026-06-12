import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

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
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: Express.User) {
    return user;
  }
}
