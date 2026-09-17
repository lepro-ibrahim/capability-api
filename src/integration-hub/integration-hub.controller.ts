import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConnectIntegrationDto } from './dto/integration-hub.dto';
import { IntegrationHubService } from './integration-hub.service';

@Controller('integration-hub')
export class IntegrationHubController {
  constructor(private readonly service: IntegrationHubService) {}

  @UseGuards(JwtAuthGuard)
  @Get('catalog')
  catalog() {
    return this.service.catalog();
  }

  @UseGuards(JwtAuthGuard)
  @Get('connections')
  list(@Req() req: { user: { userId: string; email: string; role: any } }) {
    return this.service.list(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('connections')
  connect(
    @Req() req: { user: { userId: string; email: string; role: any } },
    @Body() dto: ConnectIntegrationDto,
  ) {
    return this.service.connect(req.user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('connections/:id')
  disconnect(
    @Req() req: { user: { userId: string; email: string; role: any } },
    @Param('id') id: string,
  ) {
    return this.service.disconnect(req.user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('connections/:id/test')
  test(
    @Req() req: { user: { userId: string; email: string; role: any } },
    @Param('id') id: string,
  ) {
    return this.service.test(req.user, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('oauth/:provider/start')
  oauthStart(
    @Req() req: { user: { userId: string; email: string; role: any } },
    @Param('provider') provider: string,
  ) {
    return this.service.oauthStart(req.user, provider);
  }

  @Get('oauth/:provider/callback')
  @Redirect()
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return { url: await this.service.oauthCallback(provider, code, state) };
  }

  @Post('webhooks/:webhookKey')
  receiveWebhook(
    @Param('webhookKey') webhookKey: string,
    @Body() payload: unknown,
  ) {
    return this.service.receiveWebhook(webhookKey, payload);
  }
}
