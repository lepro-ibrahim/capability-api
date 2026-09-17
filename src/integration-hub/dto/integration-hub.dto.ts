import {
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export const CONNECTION_PROVIDERS = [
  'FATHOM',
  'GOOGLE_CALENDAR',
  'ZOOM',
  'SYSTEME_IO',
  'ZAPIER',
  'MAKE',
  'GOHIGHLEVEL',
] as const;

export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number];

export class ConnectIntegrationDto {
  @IsIn(CONNECTION_PROVIDERS)
  provider: ConnectionProvider;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  accountEmail?: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  outboundWebhookUrl?: string;

  @IsOptional()
  @IsIn(['USER', 'WORKSPACE'])
  scope?: 'USER' | 'WORKSPACE';

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
