import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ProxyModule } from './modules/proxy/proxy.module';
import { envFiles } from './config/gateway.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: envFiles }),
    ProxyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
