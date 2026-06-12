import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3002')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 4002);
}
bootstrap();
