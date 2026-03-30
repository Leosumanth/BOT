import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { AppConfigService } from "../config/app-config.service.js";
import { extractAdminToken, isExpectedAdminToken } from "./auth.utils.js";

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: {
        authorization?: string | string[] | undefined;
        "x-admin-token"?: string | string[] | undefined;
      };
    }>();

    const token = extractAdminToken(request.headers);
    if (!isExpectedAdminToken(this.config.adminApiToken, token)) {
      throw new UnauthorizedException("Admin authentication is required.");
    }

    return true;
  }
}
