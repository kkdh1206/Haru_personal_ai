import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import * as express from 'express';
import * as admin from 'firebase-admin';
import { UserService } from '../user/user.service';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { UserModule } from 'src/user/user.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [UserModule, BullModule.registerQueue({ name: 'alarm' })],
})
export class BullBoardModule implements NestModule {
  constructor(
    @InjectQueue('alarm') private readonly alarmQueue: Queue,
    private readonly userService: UserService,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: [new BullMQAdapter(this.alarmQueue)],
      serverAdapter,
    });

    /** Express Router 랩핑 + JWT(쿠키/헤더) + 관리자 role 검사 */
    const wrapper = express.Router();
    wrapper.use(async (req, res, next) => {
      // 토큰 추출
      const bearer = req.headers?.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.replace('Bearer ', '')
        : null;
      const token = bearer ?? req.cookies?.access_token;
      if (!token) return res.redirect('/admin/auth');

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        const user = await this.userService.oauthSync(
          decoded.uid,
          decoded.email,
        );
        if (user.role !== 'admin') return res.status(403).send('Forbidden');
        (req as any).user = user;
        next();
      } catch {
        return res.redirect('/admin/auth');
      }
    });
    wrapper.use('/admin/queues', serverAdapter.getRouter());

    consumer.apply(wrapper).forRoutes(
      {
        path: '/admin/queues',
        method: RequestMethod.ALL,
      },
      {
        path: '/admin/queues/*path',
        method: RequestMethod.ALL,
      },
    );
  }
}
