import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const origins = (
    process.env.CORS_ORIGIN ??
    'http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Mcp-Session-Id',
      'Accept',
      'x-device-key',
    ],
    exposedHeaders: ['Mcp-Session-Id'],
  });
  app.use(cookieParser());

  const isRawUpload = (request: Request): boolean =>
    request.originalUrl.startsWith('/api/data-files/upload');

  const rawAwareJson = (request: Request, response: Response, next: NextFunction): void => {
    if (isRawUpload(request)) {
      next();
      return;
    }
    json({ limit: '2mb' })(request, response, next);
  };
  const rawAwareUrlencoded = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    if (isRawUpload(request)) {
      next();
      return;
    }
    urlencoded({ extended: true, limit: '2mb' })(request, response, next);
  };
  app.use(rawAwareJson);
  app.use(rawAwareUrlencoded);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
