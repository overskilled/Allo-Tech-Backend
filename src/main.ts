import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // API versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger API documentation
  if (configService.get('NODE_ENV') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ALLO TECH API')
      .setDescription(`
        API for ALLO TECH - Platform connecting clients with qualified technicians.

        ## Authentication
        Most endpoints require JWT authentication. Use the /auth/login endpoint to get your access token.

        ## Roles
        - **CLIENT**: End users looking for technical services
        - **TECHNICIAN**: Service providers
        - **AGENT**: Platform agents
        - **ADMIN**: System administrators
      `)
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Authentication', 'User authentication and authorization')
      .addTag('Users', 'User management')
      .addTag('Needs', 'Service requests from clients')
      .addTag('Technicians', 'Technician profiles and operations')
      .addTag('Appointments', 'Appointment scheduling')
      .addTag('Quotations', 'Quotations and reports')
      .addTag('Messaging', 'Real-time messaging')
      .addTag('Notifications', 'Push and in-app notifications')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
    logger.log('Swagger documentation available at /docs');
  }

  // Flush batched analytics (and other onApplicationShutdown hooks) on exit.
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT', 3000);
  // Bind to 0.0.0.0 (all interfaces) so other devices on the network — e.g. the
  // mobile app on a phone — can reach the dev server via the machine's IP, not
  // just localhost.
  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Reachable on your network at: http://0.0.0.0:${port} (use this machine's IP from other devices)`);
  logger.log(`Environment: ${configService.get('NODE_ENV', 'development')}`);
}

bootstrap();
