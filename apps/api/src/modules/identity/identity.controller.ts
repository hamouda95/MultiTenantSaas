import { Controller, Post, Get, Body, UseGuards, UsePipes, ForbiddenException } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '@saas/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LoginDto, LoginDtoSchema } from '../../common/dto/auth.dto';

@Controller('api/v1/auth')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('login')
  @UsePipes(new ZodValidationPipe(LoginDtoSchema))
  async login(@Body() body: LoginDto) {
    // The demo login does not verify passwords. Refuse access in production
    // until a real authentication provider has been configured.
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Demo login is disabled in production. Configure a verified identity provider.');
    }
    let user = await this.identityService.findByEmail(body.email);
    if (!user) {
      // In development / test environment, auto-provision user if does not exist
      user = await this.identityService.createUser({
        email: body.email,
        fullName: body.email.split('@')[0],
      });
    }

    const token = await this.identityService.generateToken(user);
    const workspaces = await this.identityService.getUserWorkspaces(user.id);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      workspaces,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: AuthenticatedUserContext) {
    const profile = await this.identityService.findByEmail(user.email);
    return { profile };
  }

  @Get('workspaces')
  @UseGuards(JwtAuthGuard)
  async getWorkspaces(@CurrentUser() user: AuthenticatedUserContext) {
    const workspaces = await this.identityService.getUserWorkspaces(user.userId);
    return { workspaces };
  }
}
