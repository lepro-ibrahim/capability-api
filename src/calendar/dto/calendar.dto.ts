import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AppointmentStatus, AppointmentType, DayOfWeek } from '@prisma/client';

export class CreateCalendarAppointmentDto {
  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMin?: number;

  @IsOptional()
  @IsEnum(AppointmentType)
  type?: AppointmentType;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  bookingEventTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  attendeeName?: string;

  @IsOptional()
  @IsEmail()
  attendeeEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  attendeePhone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateCalendarAppointmentDto {
  @IsEnum(AppointmentStatus)
  status: AppointmentStatus;
}

export class AvailabilityRuleDto {
  @IsEnum(DayOfWeek)
  day: DayOfWeek;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReplaceAvailabilityDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  timezone: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  rules: AvailabilityRuleDto[];
}

export class CreateBookingEventTypeDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(15)
  @Max(480)
  durationMin: number;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsEnum(AppointmentType)
  appointmentType?: AppointmentType;

  @IsOptional()
  @IsIn(['GOOGLE_MEET', 'ZOOM', 'PHONE', 'CUSTOM'])
  locationType?: string;

  @IsOptional()
  @IsString()
  locationValue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  bufferBeforeMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  bufferAfterMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  minNoticeHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  maxDaysAhead?: number;
}

export class UpdateBookingEventTypeDto extends CreateBookingEventTypeDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PublicBookingDto {
  @IsDateString()
  startsAt: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
