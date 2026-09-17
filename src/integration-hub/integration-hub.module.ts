import { Module } from '@nestjs/common';
import { IntegrationCryptoService } from './integration-crypto.service';
import { IntegrationHubController } from './integration-hub.controller';
import { IntegrationHubService } from './integration-hub.service';

@Module({
  controllers: [IntegrationHubController],
  providers: [IntegrationHubService, IntegrationCryptoService],
  exports: [IntegrationHubService],
})
export class IntegrationHubModule {}
