import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { BillingService } from './billing.service';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('entitlement')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 구독 권한 조회' })
  getEntitlement(@Req() req) {
    return this.billing.getEntitlementByUserId(req.user._id.toString());
  }

  @Post('apple/sync')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Apple StoreKit 서명 거래 검증 및 동기화' })
  syncApple(
    @Req() req,
    @Body() body: { signedTransactionInfo?: string | null },
  ) {
    return this.billing.syncAppleTransaction(
      req.user.firebaseUid,
      body.signedTransactionInfo || null,
    );
  }

  @Post('apple/notifications')
  appleNotification(@Body() body: { signedPayload?: string }) {
    return this.billing.processAppleNotification(body.signedPayload || '');
  }

  @Post('google/sync')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Google Play 구매 토큰 검증 및 동기화' })
  syncGoogle(
    @Req() req,
    @Body() body: { purchaseToken?: string; productId?: string },
  ) {
    return this.billing.syncGooglePurchase(
      req.user.firebaseUid,
      body.purchaseToken || '',
      body.productId || '',
    );
  }

  @Post('google/notifications')
  googleNotification(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, any>,
  ) {
    return this.billing.processGoogleNotification(authorization || '', body);
  }
}
