import { Module } from '@nestjs/common';
import { CompletionPolicyController } from './completion-policy.controller';
import { CompletionPolicyService } from './completion-policy.service';

@Module({
  controllers: [CompletionPolicyController],
  providers: [CompletionPolicyService],
  exports: [CompletionPolicyService],
})
export class CompletionPolicyModule {}
