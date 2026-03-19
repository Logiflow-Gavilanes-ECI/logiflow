import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT ?? 3002;
  await app.listen(port);

  Logger.log(
    `LogiFlow Core Backend running on http://localhost:${port}/api/v1`,
    'Bootstrap',
  );
}
void bootstrap();
