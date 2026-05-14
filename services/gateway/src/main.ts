import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const defaultCorsOrigins = [
    'https://logiflowapp.z13.web.core.windows.net',
    'http://localhost:4200',
    'https://localhost',
    'capacitor://localhost',
    'http://localhost',
  ];
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const allowedOrigins = corsOrigins.length > 0
    ? corsOrigins
    : defaultCorsOrigins;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS rejected origin: ${origin}`), false);
    },
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LogiFlow Gateway API')
    .setDescription(
      'Core backend API documentation for LogiFlow gateway service.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Paste a valid access token to authorize protected endpoints.',
      },
      'bearer',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 3002;
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);

  Logger.log(
    `LogiFlow Core Backend running on http://localhost:${port}/api/v1`,
    'Bootstrap',
  );
}
void bootstrap();
