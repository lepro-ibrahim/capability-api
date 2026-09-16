import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { AnalyticsService } from "./analytics.service";
import {
  AnalyticsQueryDto,
  CreateCardDto,
  CreateDashboardDto,
  UpdateCardDto,
  UpdateDashboardDto,
} from "./dto/analytics.dto";

type AuthenticatedRequest = {
  user: { userId: string; role: Role; email: string };
};

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("catalog")
  catalog() {
    return this.analytics.catalog();
  }

  @Get("dashboards")
  dashboards(@Req() req: AuthenticatedRequest) {
    return this.analytics.listDashboards(req.user);
  }

  @Post("dashboards")
  createDashboard(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateDashboardDto,
  ) {
    return this.analytics.createDashboard(req.user, body);
  }

  @Get("dashboards/:id")
  dashboard(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.analytics.getDashboard(req.user, id);
  }

  @Patch("dashboards/:id")
  updateDashboard(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: UpdateDashboardDto,
  ) {
    return this.analytics.updateDashboard(req.user, id, body);
  }

  @Post("dashboards/:id/duplicate")
  duplicateDashboard(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.analytics.duplicateDashboard(req.user, id);
  }

  @Post("dashboards/:id/cards")
  createCard(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: CreateCardDto,
  ) {
    return this.analytics.createCard(req.user, id, body);
  }

  @Patch("cards/:id")
  updateCard(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: UpdateCardDto,
  ) {
    return this.analytics.updateCard(req.user, id, body);
  }

  @Delete("cards/:id")
  deleteCard(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.analytics.deleteCard(req.user, id);
  }

  @Post("query")
  query(@Req() req: AuthenticatedRequest, @Body() body: AnalyticsQueryDto) {
    return this.analytics.query(req.user, body);
  }
}
