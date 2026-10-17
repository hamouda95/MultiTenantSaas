import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    JwtModule.register({
      // Secret is resolved at signing/verification after ConfigModule loads environment.
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, JwtAuthGuard],
  exports: [IdentityService, JwtAuthGuard, JwtModule],
})
export class IdentityModule {}
