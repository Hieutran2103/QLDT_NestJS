import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../guards/acccessToken.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

export const PERMISSIONS_KEY = 'permissions';

export const Auth = (permission: string) => {
  return applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permission),
    UseGuards(AccessTokenGuard, PermissionsGuard),
  );
};
