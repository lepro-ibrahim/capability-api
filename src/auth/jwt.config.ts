export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (
    process.env.NODE_ENV === 'production' &&
    (!secret || secret.length < 32)
  ) {
    throw new Error(
      'JWT_SECRET must contain at least 32 characters in production',
    );
  }
  return secret || 'dev-secret';
}
