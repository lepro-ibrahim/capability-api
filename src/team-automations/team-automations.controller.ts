import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Role, TeamTaskStatus } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  CreateManualTeamTaskDto,
  CreateTeamAutomationRuleDto,
  UpdateTeamAutomationRuleDto,
  UpdateTeamTaskDto,
} from "./dto/team-automation.dto";
import { TeamAutomationsService } from "./team-automations.service";

type RequestUser = { userId: string; email: string; role: Role };

@Controller("team-automations")
export class TeamAutomationsController {
  constructor(private readonly service: TeamAutomationsService) {}

  @Get("summary")
  summary(@Req() request: { user: RequestUser }) {
    return this.service.summary(request.user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get("catalog")
  catalog() {
    return this.service.catalog();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get("rules")
  rules() {
    return this.service.listRules();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post("rules")
  createRule(
    @Req() request: { user: RequestUser },
    @Body() body: CreateTeamAutomationRuleDto,
  ) {
    return this.service.createRule(request.user, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post("rules/from-template/:key")
  createFromTemplate(
    @Req() request: { user: RequestUser },
    @Param("key") key: string,
  ) {
    return this.service.createFromTemplate(request.user, key);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch("rules/:id")
  updateRule(
    @Param("id") id: string,
    @Body() body: UpdateTeamAutomationRuleDto,
  ) {
    return this.service.updateRule(id, body);
  }

  @Get("tasks")
  listTasks(
    @Req() request: { user: RequestUser },
    @Query("status") status?: TeamTaskStatus,
  ) {
    const safeStatus = Object.values(TeamTaskStatus).includes(
      status as TeamTaskStatus,
    )
      ? status
      : undefined;
    return this.service.listTasks(request.user, safeStatus);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post("tasks")
  createTask(
    @Req() request: { user: RequestUser },
    @Body() body: CreateManualTeamTaskDto,
  ) {
    return this.service.createManualTask(request.user, body);
  }

  @Patch("tasks/:id")
  updateTask(
    @Req() request: { user: RequestUser },
    @Param("id") id: string,
    @Body() body: UpdateTeamTaskDto,
  ) {
    return this.service.updateTask(request.user, id, body.status);
  }

  @Get("notifications")
  notifications(@Req() request: { user: RequestUser }) {
    return this.service.listNotifications(request.user);
  }

  @Patch("notifications/:id/read")
  markNotificationRead(
    @Req() request: { user: RequestUser },
    @Param("id") id: string,
  ) {
    return this.service.markNotificationRead(request.user, id);
  }

  @Post("notifications/read-all")
  markAllNotificationsRead(@Req() request: { user: RequestUser }) {
    return this.service.markAllNotificationsRead(request.user);
  }
}
