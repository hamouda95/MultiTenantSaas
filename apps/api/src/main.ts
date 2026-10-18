import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { jwtSecret } from './common/auth-security';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  jwtSecret();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  // Enable CORS with tenant-safe header allowance
  app.enableCors({
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-request-id'],
  });

  // Swagger / OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('Enterprise Multi-Tenant B2B SaaS Platform API')
    .setDescription(
      'Production-oriented, strictly tenant-isolated API architecture with PostgreSQL RLS, hybrid placement, and AI services.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'x-tenant-id', in: 'header' }, 'TenantId')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`Enterprise SaaS API is running on: http://localhost:${port}`);
  logger.log(`OpenAPI Documentation available at: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Fatal error during application startup:', err);
  process.exit(1);
});
