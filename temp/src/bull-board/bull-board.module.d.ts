import { NestModule, MiddlewareConsumer } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { Queue } from 'bullmq';
export declare class BullBoardModule implements NestModule {
    private readonly alarmQueue;
    private readonly userService;
    constructor(alarmQueue: Queue, userService: UserService);
    configure(consumer: MiddlewareConsumer): void;
}
