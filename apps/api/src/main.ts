import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy === 'true' || trustProxy === '1') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(helmet());

  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3002')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerEnabled = (process.env.SWAGGER_ENABLED ?? 'true') !== 'false';
  if (swaggerEnabled) {
    const swaggerPath = process.env.SWAGGER_PATH ?? 'docs';
    const config = new DocumentBuilder()
      .setTitle('HR Management API')
      .setDescription('Backend API for HR Management system')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerPath, app, document, {
      jsonDocumentUrl: `${swaggerPath}-json`,
    });
  }

  await app.listen(process.env.PORT ?? 4002);
}
bootstrap();
