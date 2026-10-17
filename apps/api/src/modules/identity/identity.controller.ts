import { Controller, Post, Get, Body, UseGuards, Res, Req } from '@nestjs/common';
import type { Response, Request } from 'express';
import { z } from 'zod';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUserContext, User } from '@saas/types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LoginDto, LoginDtoSchema, RegisterDtoSchema } from '../../common/dto/auth.dto';
import { cookieOptions, sessionCookie } from '../../common/auth-security';

@Controller('api/v1/auth')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  private async session(user: User, response: Response) {
    response.cookie(sessionCookie, await this.identityService.generateToken(user), cookieOptions());
    return { user, workspaces: await this.identityService.getUserWorkspaces(user.id) };
  }

  @Post('login')
  async login(@Body(new ZodValidationPipe(LoginDtoSchema)) body: LoginDto, @Res({ passthrough: true }) response: Response) {
    return this.session(await this.identityService.authenticate(body.email, body.password), response);
  }

  @Post('register')
  async register(@Body(new ZodValidationPipe(RegisterDtoSchema)) body: z.infer<typeof RegisterDtoSchema>, @Res({ passthrough: true }) response: Response) {
    return this.session(await this.identityService.register(body.email, body.password, body.fullName, body.invitationToken), response);
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.identityService.revokeSession(request.headers.cookie);
    response.clearCookie(sessionCookie, { ...cookieOptions(), maxAge: undefined });
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() user: AuthenticatedUserContext) {
    return { profile: await this.identityService.findByEmail(user.email) };
  }

  @Get('workspaces')
  @UseGuards(JwtAuthGuard)
  async getWorkspaces(@CurrentUser() user: AuthenticatedUserContext) {
    return { workspaces: await this.identityService.getUserWorkspaces(user.userId) };
  }
}
