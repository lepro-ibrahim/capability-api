import { Module } from '@nestjs/common';
import { IntegrationHubModule } from '../integration-hub/integration-hub.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [IntegrationHubModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
