import { Module } from '@nestjs/common';
import { GatewayProxyService } from './services/gateway-proxy.service';
import { HttpProxyService } from './services/http-proxy.service';
import { WebsocketProxyService } from './services/websocket-proxy.service';

@Module({
  providers: [GatewayProxyService, HttpProxyService, WebsocketProxyService],
  exports: [GatewayProxyService],
})
export class ProxyModule {}
