import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureGateway } from './bootstrap/configure-gateway';
import { configureSwagger } from './bootstrap/configure-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  await configureGateway(app);
  configureSwagger(app);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
