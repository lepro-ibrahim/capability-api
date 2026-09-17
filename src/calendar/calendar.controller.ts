import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CalendarService } from './calendar.service';
import {
  CreateBookingEventTypeDto,
  CreateCalendarAppointmentDto,
  PublicBookingDto,
  ReplaceAvailabilityDto,
  UpdateBookingEventTypeDto,
  UpdateCalendarAppointmentDto,
} from './dto/calendar.dto';

type RequestWithUser = { user: { userId: string; email: string; role: any } };

@Controller('calendar')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @UseGuards(JwtAuthGuard)
  @Get('overview')
  overview(
    @Req() req: RequestWithUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    const start = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const end = to ? new Date(to) : new Date(Date.now() + 35 * 86_400_000);
    return this.service.overview(req.user, start, end, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('appointments')
  create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateCalendarAppointmentDto,
  ) {
    return this.service.create(req.user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('appointments/:id/status')
  updateStatus(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarAppointmentDto,
  ) {
    return this.service.updateStatus(req.user, id, dto.status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('availability')
  availability(@Req() req: RequestWithUser, @Query('userId') userId?: string) {
    return this.service.availability(req.user, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('availability')
  replaceAvailability(
    @Req() req: RequestWithUser,
    @Body() dto: ReplaceAvailabilityDto,
  ) {
    return this.service.replaceAvailability(req.user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('event-types')
  eventTypes(@Req() req: RequestWithUser, @Query('userId') userId?: string) {
    return this.service.eventTypes(req.user, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('event-types')
  createEventType(
    @Req() req: RequestWithUser,
    @Body() dto: CreateBookingEventTypeDto,
  ) {
    return this.service.createEventType(req.user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('event-types/:id')
  updateEventType(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateBookingEventTypeDto,
  ) {
    return this.service.updateEventType(req.user, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sync/google')
  syncGoogle(
    @Req() req: RequestWithUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    const start = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 86_400_000);
    const end = to ? new Date(to) : new Date(Date.now() + 90 * 86_400_000);
    return this.service.syncGoogle(req.user, start, end, userId);
  }

  @Get('public/:slug')
  publicEventType(@Param('slug') slug: string) {
    return this.service.publicEventType(slug);
  }

  @Get('public/:slug/slots')
  slots(
    @Param('slug') slug: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.slots(slug, new Date(from), new Date(to));
  }

  @Post('public/:slug/book')
  book(@Param('slug') slug: string, @Body() dto: PublicBookingDto) {
    return this.service.book(slug, dto);
  }
}
