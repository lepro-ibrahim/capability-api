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
import { Role } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CloserSpaceService, RequestUser } from "./closer-space.service";
import {
  CreateCloserLedgerEntryDto,
  CreateCloserReportDto,
  UpdateCloserSettingsDto,
} from "./dto/closer-space.dto";

@UseGuards(RolesGuard)
@Roles(Role.ADMIN, Role.CLOSER)
@Controller("closer-space")
export class CloserSpaceController {
  constructor(private readonly service: CloserSpaceService) {}

  @Get("closers")
  closers(@Req() request: { user: RequestUser }) {
    return this.service.listClosers(request.user);
  }

  @Get("cockpit")
  cockpit(
    @Req() request: { user: RequestUser },
    @Query("closerId") closerId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.cockpit(request.user, { closerId, from, to });
  }

  @Post("reports")
  createReport(
    @Req() request: { user: RequestUser },
    @Body() body: CreateCloserReportDto,
  ) {
    return this.service.createReport(request.user, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post("ledger")
  createLedger(@Body() body: CreateCloserLedgerEntryDto) {
    return this.service.createLedgerEntry(body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch("closers/:closerId/settings")
  updateSettings(
    @Param("closerId") closerId: string,
    @Body() body: UpdateCloserSettingsDto,
  ) {
    return this.service.updateSettings(closerId, body);
  }
}
