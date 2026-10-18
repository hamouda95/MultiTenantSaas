import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

function requiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return 'test-only-secret-that-is-at-least-32-chars';
  throw new Error('JWT_SECRET must contain at least 32 characters');
}

@Module({
  imports: [
    JwtModule.register({
      secret: requiredJwtSecret(),
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, JwtAuthGuard],
  exports: [IdentityService, JwtAuthGuard, JwtModule],
})
export class IdentityModule {}
