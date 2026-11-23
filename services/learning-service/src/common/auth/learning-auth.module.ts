import { Global, Module } from '@nestjs/common';
import { IdentityClient } from '../../integrations/identity.client';
import { LearningAuthGuard } from './learning-auth.guard';

@Global()
@Module({
  providers: [IdentityClient, LearningAuthGuard],
  exports: [IdentityClient, LearningAuthGuard],
})
export class LearningAuthModule {}
