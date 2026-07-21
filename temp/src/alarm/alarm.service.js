"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlarmService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const alarm_schema_1 = require("./schemas/alarm.schema");
const mongoose_2 = require("mongoose");
const user_service_1 = require("../user/user.service");
const apns_service_1 = require("../apns/apns.service");
const bullmq_1 = require("bullmq");
const bullmq_2 = require("@nestjs/bullmq");
const luxon_1 = require("luxon");
const livekit_service_1 = require("../livekit/livekit.service");
const prompt_service_1 = require("../prompt/prompt.service");
const config_1 = require("@nestjs/config");
const fcm_service_1 = require("../fcm/fcm.service");
const HARU_NAME = '하루';
const HARI_NAME = '하리';
const HARU_VOICE = 'Charon';
const HARI_VOICE = 'Leda';
const DEFAULT_WAKE_INTENSITY = 'gentle';
const DEFAULT_PREWARM_LEAD_SECONDS = 20;
const DEFAULT_RETRY_MINUTES = 2;
const MAX_DAILY_RETRY_CALLS = 1;
const DEFAULT_CALL_AGENT_CHECK_TIMEOUT_MS = 1000;
const DEFAULT_RETRY_LIMIT_MESSAGE = '전화는 여기까지 할게요. 이제 로컬 알람으로 한 번 더 깨워볼게요. 지금 바로 일어나 주세요.';
let AlarmService = class AlarmService {
    constructor(livekit, apnsService, fcmService, userService, promptService, alarmModel, alarmQueue, cs) {
        this.livekit = livekit;
        this.apnsService = apnsService;
        this.fcmService = fcmService;
        this.userService = userService;
        this.promptService = promptService;
        this.alarmModel = alarmModel;
        this.alarmQueue = alarmQueue;
        this.cs = cs;
        this.livekitUrl = this.cs.getOrThrow('livekit.websocketUrl');
        this.prewarmLeadMs =
            this.getNonNegativeConfigNumber('alarm.prewarmLeadSeconds', DEFAULT_PREWARM_LEAD_SECONDS) * 1000;
        this.defaultRetryMinutes = this.getPositiveConfigNumber('alarm.retryMinutes', DEFAULT_RETRY_MINUTES);
        this.maxDailyRetryCalls = this.getPositiveConfigNumber('alarm.maxDailyRetryCalls', MAX_DAILY_RETRY_CALLS);
        this.callAgentCheckTimeoutMs = this.getPositiveConfigNumber('alarm.callAgentCheckTimeoutMs', DEFAULT_CALL_AGENT_CHECK_TIMEOUT_MS);
    }
    getMaxDailyRetryCalls() {
        return this.maxDailyRetryCalls;
    }
    async onModuleInit() {
        await this.recoverActiveAlarms();
    }
    getPositiveConfigNumber(path, defaultValue) {
        const value = Number(this.cs.get(path));
        if (!Number.isFinite(value) || value <= 0) {
            return defaultValue;
        }
        return value;
    }
    getNonNegativeConfigNumber(path, defaultValue) {
        const value = Number(this.cs.get(path));
        if (!Number.isFinite(value) || value < 0) {
            return defaultValue;
        }
        return value;
    }
    normalizeAlarmPayload(dto) {
        const wakeIntensity = this.normalizeWakeIntensity(dto.wakeIntensity);
        const role = dto.role === HARI_NAME ? HARI_NAME : HARU_NAME;
        return Object.assign(Object.assign({}, dto), { personality: wakeIntensity, role, voice: role === HARI_NAME ? HARI_VOICE : HARU_VOICE, wakeIntensity });
    }
    normalizeWakeIntensity(value) {
        return value === 'firm' ? value : DEFAULT_WAKE_INTENSITY;
    }
    getLocalDateKey(timeZone) {
        return luxon_1.DateTime.now()
            .setZone(timeZone || 'Asia/Seoul')
            .toFormat('yyyy-MM-dd');
    }
    fallbackPrompt(language, name, assistantName = HARU_NAME) {
        const displayName = (name === null || name === void 0 ? void 0 : name.trim()) || '사용자';
        if (language === null || language === void 0 ? void 0 : language.toLowerCase().includes('english')) {
            return `You are ${assistantName}. Wake ${displayName} up in short, natural English. Start with a wake-up line.`;
        }
        if ((language === null || language === void 0 ? void 0 : language.toLowerCase().includes('japanese')) ||
            (language === null || language === void 0 ? void 0 : language.includes('日本')) ||
            (language === null || language === void 0 ? void 0 : language.includes('일본'))) {
            return `あなたは${assistantName}です。${displayName}を短く自然な日本語で起こしてください。最初は起床を促す一言から始めます。`;
        }
        return `${assistantName}다. ${displayName}를 짧고 자연스럽게 깨워라. 첫 문장은 일어날 시간이라는 말로 시작한다.`;
    }
    async resetDailyRetryStateIfNeeded(alarm) {
        const todayKey = this.getLocalDateKey(alarm.timeZone || 'Asia/Seoul');
        if (alarm.retryTrackingDate === todayKey) {
            return todayKey;
        }
        alarm.retryTrackingDate = todayKey;
        alarm.dailyRetryCount = 0;
        alarm.retryLimitNoticeDate = null;
        await alarm.save();
        return todayKey;
    }
    serializeAlarm(alarm) {
        if (!alarm) {
            return alarm;
        }
        const alarmObject = typeof alarm.toObject === 'function' ? alarm.toObject() : alarm;
        const wakeIntensity = this.normalizeWakeIntensity(alarmObject.wakeIntensity);
        const role = alarmObject.role === HARI_NAME ? HARI_NAME : HARU_NAME;
        return Object.assign(Object.assign({}, alarmObject), { role, voice: role === HARI_NAME ? HARI_VOICE : HARU_VOICE, personality: wakeIntensity, wakeIntensity });
    }
    async createAlarm(userId, dto) {
        const alarm = await this.alarmModel.create(Object.assign({ userId }, this.normalizeAlarmPayload(dto)));
        await this.scheduleAlarm(alarm);
        return this.serializeAlarm(alarm.toObject());
    }
    findAllAlarms(userId) {
        return this.alarmModel
            .find({ userId })
            .lean()
            .then((alarms) => alarms.map((alarm) => this.serializeAlarm(alarm)));
    }
    async updateAlarm(userId, id, dto) {
        const alarm = await this.alarmModel.findById(id).lean();
        if (alarm.userId.toString() !== userId) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const updatedAlarm = await this.alarmModel.findByIdAndUpdate(id, this.normalizeAlarmPayload(dto), {
            new: true,
        });
        await this.clearJobs(id);
        await this.scheduleAlarm(updatedAlarm);
        return this.serializeAlarm(updatedAlarm === null || updatedAlarm === void 0 ? void 0 : updatedAlarm.toObject());
    }
    async deleteAlarm(userId, id) {
        const alarm = await this.alarmModel.findById(id).lean();
        if (alarm.userId.toString() !== userId) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        await this.clearJobs(id);
        return this.alarmModel.findByIdAndDelete(id);
    }
    async recoverActiveAlarms() {
        const activeAlarms = await this.alarmModel.find({ isOn: true });
        await Promise.all(activeAlarms.map((alarm) => this.scheduleAlarm(alarm)));
        console.log(`[Alarm] recovered active alarms → count=${activeAlarms.length}`);
    }
    async scheduleAlarm(alarm) {
        if (!alarm.isOn)
            return;
        const tz = alarm.timeZone;
        const [hour, minute] = alarm.time.split(':').map(Number);
        if (alarm.repeatDays.length) {
            await Promise.all(alarm.repeatDays.map((day) => this.scheduleRepeatDay(alarm, day)));
        }
        else {
            const next = this.nextOnce(hour, minute, tz, alarm.targetDate || undefined);
            await this.scheduleCallJobs({
                baseJobId: `${alarm._id}-once-${next.getTime()}`,
                callAt: next,
                alarm,
                data: {
                    alarmId: alarm._id.toString(),
                    oneTime: true,
                    callType: 'initial',
                    retryCount: 0,
                },
            });
        }
    }
    async scheduleNextRepeatAlarm(alarm, day) {
        return this.scheduleRepeatDay(alarm, day);
    }
    async disableOrphanedAlarm(alarmId, reason = 'missing user') {
        await this.alarmModel.findByIdAndUpdate(alarmId, { isOn: false });
        await this.clearJobs(alarmId, reason);
        console.warn(`[Alarm] orphaned alarm disabled → ${JSON.stringify({
            alarmId,
            reason,
        })}`);
    }
    async scheduleRepeatDay(alarm, day) {
        const [hour, minute] = alarm.time.split(':').map(Number);
        const next = this.nextDayOfWeek(day, hour, minute, alarm.timeZone);
        return this.scheduleCallJobs({
            baseJobId: `${alarm._id}-${day}-${next.getTime()}`,
            callAt: next,
            alarm,
            repeatDay: day,
            data: {
                alarmId: alarm._id.toString(),
                day,
                callType: 'initial',
                retryCount: 0,
            },
        });
    }
    async scheduleCallJobs({ baseJobId, callAt, alarm, repeatDay, data, }) {
        const prewarmAt = new Date(callAt.getTime() - this.prewarmLeadMs);
        const prewarmDelay = Math.max(0, prewarmAt.getTime() - Date.now());
        const callDelay = Math.max(0, callAt.getTime() - Date.now());
        await Promise.all([
            this.addScheduledJob({
                jobId: `${baseJobId}-prewarm`,
                delay: prewarmDelay,
                scheduledAt: prewarmAt,
                alarm,
                repeatDay,
                data: Object.assign(Object.assign({}, data), { action: 'prewarm' }),
            }),
            this.addScheduledJob({
                jobId: `${baseJobId}-call`,
                delay: callDelay,
                scheduledAt: callAt,
                alarm,
                repeatDay,
                data: Object.assign(Object.assign({}, data), { action: 'call' }),
            }),
        ]);
    }
    async addScheduledJob({ jobId, delay, scheduledAt, alarm, repeatDay, data, }) {
        const existingJob = await this.alarmQueue.getJob(jobId);
        const existingJobState = existingJob ? await existingJob.getState() : null;
        const isAlreadyScheduled = existingJob &&
            ['delayed', 'waiting', 'waiting-children', 'paused'].includes(existingJobState);
        if (isAlreadyScheduled) {
            const logPayload = {
                alarmId: alarm._id.toString(),
                userId: alarm.userId.toString(),
                repeatDay,
                action: data.action,
                localScheduledAt: luxon_1.DateTime.fromJSDate(scheduledAt)
                    .setZone(alarm.timeZone || 'Asia/Seoul')
                    .toISO(),
                utcScheduledAt: scheduledAt.toISOString(),
                delay,
                jobId,
                returnedJobId: existingJob.id,
                jobState: existingJobState,
                existingJobState,
            };
            console.log(`[Alarm] job already scheduled → ${JSON.stringify(logPayload)}`);
            return existingJob;
        }
        const returnedJob = await this.alarmQueue.add('trigger', data, {
            jobId,
            delay,
            removeOnComplete: true,
            removeOnFail: { count: 1000 },
        });
        const jobState = await returnedJob.getState();
        const logPayload = {
            alarmId: alarm._id.toString(),
            userId: alarm.userId.toString(),
            repeatDay,
            action: data.action,
            localScheduledAt: luxon_1.DateTime.fromJSDate(scheduledAt)
                .setZone(alarm.timeZone || 'Asia/Seoul')
                .toISO(),
            utcScheduledAt: scheduledAt.toISOString(),
            delay,
            jobId,
            returnedJobId: returnedJob.id,
            jobState,
            existingJobState,
        };
        if (existingJobState) {
            console.warn(`[Alarm] job collision detected → ${JSON.stringify(logPayload)}`);
            return returnedJob;
        }
        console.log(`[Alarm] job scheduled → ${JSON.stringify(logPayload)}`);
        return returnedJob;
    }
    nextDayOfWeek(day, h, m, tz) {
        const now = luxon_1.DateTime.local().setZone(tz);
        const daysDiff = (day - (now.weekday % 7) + 7) % 7;
        let target = now
            .plus({ days: daysDiff })
            .set({ hour: h, minute: m, second: 0, millisecond: 0 });
        if (target <= now) {
            target = target.plus({ days: 7 });
        }
        return target.toJSDate();
    }
    nextOnce(h, m, tz, targetDate) {
        const now = luxon_1.DateTime.local().setZone(tz);
        let target = targetDate
            ? luxon_1.DateTime.fromISO(targetDate, { zone: tz }).set({
                hour: h,
                minute: m,
                second: 0,
                millisecond: 0,
            })
            : now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
        if (target <= now) {
            target = target.plus({ days: 1 });
        }
        return target.toJSDate();
    }
    async clearJobs(alarmId, removalReason = 'alarm rescheduled') {
        const jobIds = [
            `${alarmId}-once`,
            `${alarmId}-once-prewarm`,
            `${alarmId}-once-call`,
            `${alarmId}-retry`,
            `${alarmId}-retry-prewarm`,
            `${alarmId}-retry-call`,
            ...Array.from({ length: 7 }, (_, day) => `${alarmId}-${day}`),
            ...Array.from({ length: 7 }, (_, day) => `${alarmId}-${day}-prewarm`),
            ...Array.from({ length: 7 }, (_, day) => `${alarmId}-${day}-call`),
        ];
        const prefixes = [
            `${alarmId}-once-`,
            `${alarmId}-retry-`,
            ...Array.from({ length: 7 }, (_, day) => `${alarmId}-${day}-`),
        ];
        const queuedJobs = await this.alarmQueue.getJobs([
            'delayed',
            'waiting',
            'paused',
            'prioritized',
            'waiting-children',
            'completed',
            'failed',
        ], 0, -1, false);
        queuedJobs.forEach((job) => {
            var _a;
            const id = (_a = job.id) === null || _a === void 0 ? void 0 : _a.toString();
            if (id && prefixes.some((prefix) => id.startsWith(prefix))) {
                jobIds.push(id);
            }
        });
        await this.removeJobs(Array.from(new Set(jobIds)), removalReason);
    }
    async removeJobs(jobIds, removalReason = 'explicit remove') {
        await Promise.all(jobIds.map(async (jobId) => {
            const job = await this.alarmQueue.getJob(jobId);
            if (!job) {
                return;
            }
            const state = await job.getState();
            try {
                await job.remove();
                console.log(`[Alarm] removed job → ${JSON.stringify({
                    alarmId: jobId.split('-')[0],
                    jobId,
                    previousState: state,
                    removalReason,
                })}`);
            }
            catch (error) {
                console.warn(`[Alarm] failed to remove job → ${JSON.stringify({
                    alarmId: jobId.split('-')[0],
                    jobId,
                    previousState: state,
                    removalReason,
                    error: error === null || error === void 0 ? void 0 : error.message,
                })}`);
            }
        }));
    }
    async findOne(id) {
        return this.alarmModel.findById(id).lean();
    }
    async getAlarmWithUser(alarmId) {
        const alarm = await this.alarmModel
            .findById(alarmId)
            .populate({
            path: 'user',
            select: '_id name email language timeZone interest location customMessage',
        })
            .lean();
        return this.serializeAlarm(alarm);
    }
    async sendRetryLimitPush(alarm) {
        const todayKey = this.getLocalDateKey(alarm.timeZone || 'Asia/Seoul');
        if (alarm.retryLimitNoticeDate === todayKey) {
            return {
                success: true,
                skipped: true,
                message: 'Retry limit push already sent today.',
            };
        }
        const deviceToken = await this.userService.getUserDeviceToken(alarm.userId.toString());
        if (!(deviceToken === null || deviceToken === void 0 ? void 0 : deviceToken.deviceToken)) {
            return {
                success: false,
                skipped: true,
                message: 'Device token not found.',
            };
        }
        const followupToken = deviceToken.deviceType === 'android'
            ? deviceToken.deviceToken
            : deviceToken.notificationToken;
        if (!followupToken) {
            alarm.retryLimitNoticeDate = todayKey;
            await alarm.save();
            return {
                success: true,
                skipped: true,
                message: 'Notification token not found.',
            };
        }
        const pushResult = deviceToken.deviceType === 'android'
            ? await this.fcmService.sendWakeFollowupPush(followupToken, DEFAULT_RETRY_LIMIT_MESSAGE)
            : await this.apnsService.sendWakeFollowupPush(followupToken, DEFAULT_RETRY_LIMIT_MESSAGE);
        if (pushResult.sent.length) {
            alarm.retryLimitNoticeDate = todayKey;
            await alarm.save();
        }
        return {
            success: pushResult.sent.length > 0,
            sent: pushResult.sent.length,
            failed: pushResult.failed.length,
        };
    }
    async buildPromptForAlarm(normalizedAlarm, callType, retryCount) {
        const alarmId = normalizedAlarm._id.toString();
        const userId = normalizedAlarm.userId.toString();
        try {
            return await this.promptService.getPrompt(alarmId, callType, retryCount);
        }
        catch (error) {
            console.error(`[Alarm] prompt failed → ${alarmId}`, error);
            const user = await this.userService.findOne(new mongoose_2.Types.ObjectId(userId));
            return this.fallbackPrompt(user === null || user === void 0 ? void 0 : user.language, user === null || user === void 0 ? void 0 : user.name, normalizedAlarm.role);
        }
    }
    async prewarmCall(alarm, options = {}) {
        var _a;
        const normalizedAlarm = this.serializeAlarm(alarm);
        if (!(normalizedAlarm === null || normalizedAlarm === void 0 ? void 0 : normalizedAlarm._id) || !(normalizedAlarm === null || normalizedAlarm === void 0 ? void 0 : normalizedAlarm.userId)) {
            throw new Error('Invalid alarm payload');
        }
        const callType = options.callType || 'initial';
        const retryCount = (_a = options.retryCount) !== null && _a !== void 0 ? _a : 0;
        const alarmId = normalizedAlarm._id.toString();
        const userId = normalizedAlarm.userId.toString();
        const prompt = await this.buildPromptForAlarm(normalizedAlarm, callType, retryCount);
        await this.livekit.prewarmAgent(alarmId, prompt, normalizedAlarm.voice, userId, normalizedAlarm.timeZone || 'Asia/Seoul', alarmId, callType, retryCount);
    }
    async call(alarm, options = {}) {
        const normalizedAlarm = this.serializeAlarm(alarm);
        if (!(normalizedAlarm === null || normalizedAlarm === void 0 ? void 0 : normalizedAlarm._id) || !(normalizedAlarm === null || normalizedAlarm === void 0 ? void 0 : normalizedAlarm.userId)) {
            throw new Error('Invalid alarm payload');
        }
        const alarmId = normalizedAlarm._id.toString();
        const userId = normalizedAlarm.userId.toString();
        const deviceToken = await this.userService.getUserDeviceToken(userId);
        if (!(deviceToken === null || deviceToken === void 0 ? void 0 : deviceToken.deviceToken)) {
            throw new Error(`Device token not found for user ${userId}`);
        }
        await this.livekit.ensureRoom(alarmId);
        try {
            await this.livekit.waitForAgentParticipant(alarmId, this.callAgentCheckTimeoutMs);
        }
        catch (error) {
            console.warn(`[Alarm] LiveKit agent not visible before push → ${alarmId}`, error);
        }
        const room = alarmId;
        const tokenClient = await this.livekit.generateLivkitToken(room, userId);
        const pushResult = deviceToken.deviceType === 'android'
            ? await this.fcmService.sendCallPush(deviceToken.deviceToken, {
                caller: HARU_NAME,
                lkUrl: this.livekitUrl,
                lkToken: tokenClient,
                alarmId,
            })
            : await this.apnsService.sendVoipPush(deviceToken.deviceToken, {
                caller: HARU_NAME,
                livekitToken: tokenClient,
                alarmId,
            });
        if (!pushResult.sent.length) {
            const reasons = pushResult.failed
                .map((failure) => {
                var _a, _b;
                const reason = ((_a = failure.response) === null || _a === void 0 ? void 0 : _a.reason) || ((_b = failure.error) === null || _b === void 0 ? void 0 : _b.message);
                return [failure.status, reason].filter(Boolean).join(' ');
            })
                .filter(Boolean)
                .join(', ');
            throw new Error(`Push failed for alarm ${alarmId}${reasons ? `: ${reasons}` : ''}`);
        }
    }
    async testCall(user, dto) {
        const normalizedTest = this.normalizeAlarmPayload(dto);
        const prompt = await this.promptService.getTestCallPrompt(user, normalizedTest.wakeIntensity, normalizedTest.role);
        await this.livekit.ensureAgentReadyForTest(user._id + '_test', prompt, normalizedTest.voice, user._id, user.timeZone || 'Asia/Seoul');
        const room = user._id + '_test';
        const tokenClient = await this.livekit.generateLivkitToken(room, user._id);
        return {
            lkToken: tokenClient,
            lkUrl: this.livekitUrl,
        };
    }
    async scheduleRetryCall(alarmId, retryMinutes) {
        const alarm = await this.alarmModel.findById(alarmId);
        if (!alarm) {
            throw new Error(`Alarm not found: ${alarmId}`);
        }
        return this.scheduleRetryCallForAlarm(alarm, retryMinutes);
    }
    async scheduleRetryCallForAlarm(alarm, retryMinutes) {
        const normalizedRetryMinutes = Math.min(Math.max(retryMinutes !== null && retryMinutes !== void 0 ? retryMinutes : this.defaultRetryMinutes, 1), 30);
        await this.resetDailyRetryStateIfNeeded(alarm);
        if (alarm.dailyRetryCount >= this.maxDailyRetryCalls) {
            return {
                success: false,
                limitReached: true,
                alarmId: alarm._id.toString(),
                retryMinutes: normalizedRetryMinutes,
                message: "You've reached today's retry call limit.",
            };
        }
        const alarmId = alarm._id.toString();
        const retryCount = alarm.dailyRetryCount + 1;
        await this.clearRetryJobs(alarmId);
        const delay = normalizedRetryMinutes * 60 * 1000;
        const scheduledAt = new Date(Date.now() + delay);
        await this.scheduleCallJobs({
            baseJobId: `${alarmId}-retry-${scheduledAt.getTime()}-${retryCount}`,
            callAt: scheduledAt,
            alarm,
            data: {
                alarmId,
                retry: true,
                callType: 'retry',
                retryCount,
                retryMinutes: normalizedRetryMinutes,
            },
        });
        alarm.dailyRetryCount = retryCount;
        alarm.lastRetryScheduledAt = scheduledAt;
        alarm.lastCallType = 'retry';
        await alarm.save();
        return {
            success: true,
            alarmId,
            retryCount,
            retryMinutes: normalizedRetryMinutes,
            scheduledAt: scheduledAt.toISOString(),
        };
    }
    async handleCallOutcome(dto) {
        var _a;
        const alarm = await this.alarmModel.findById(dto.alarmId);
        if (!alarm) {
            throw new Error(`Alarm not found: ${dto.alarmId}`);
        }
        await this.resetDailyRetryStateIfNeeded(alarm);
        alarm.lastCallType = dto.callType;
        alarm.lastWakeStatus = dto.wakeStatus;
        alarm.lastTriggeredAt = new Date();
        await alarm.save();
        if (dto.wakeStatus === 'awake') {
            await this.clearRetryJobs(dto.alarmId);
            return {
                success: true,
                action: 'none',
                wakeStatus: dto.wakeStatus,
                message: 'User is awake. Retry flow stopped.',
            };
        }
        const retryMinutes = (_a = dto.retryMinutes) !== null && _a !== void 0 ? _a : this.defaultRetryMinutes;
        const retryResult = await this.scheduleRetryCallForAlarm(alarm, retryMinutes);
        if (retryResult.success) {
            return Object.assign({ success: true, action: 'retry_scheduled', wakeStatus: dto.wakeStatus }, retryResult);
        }
        const pushResult = await this.sendRetryLimitPush(alarm);
        return {
            success: true,
            action: 'retry_limit_reached',
            wakeStatus: dto.wakeStatus,
            retryLimit: this.maxDailyRetryCalls,
            message: retryResult.message,
            push: pushResult,
        };
    }
    async clearRetryJobs(alarmId) {
        const legacyJobIds = [
            `${alarmId}-retry`,
            `${alarmId}-retry-prewarm`,
            `${alarmId}-retry-call`,
        ];
        const queuedJobs = await this.alarmQueue.getJobs([
            'delayed',
            'waiting',
            'paused',
            'prioritized',
            'waiting-children',
            'completed',
            'failed',
        ], 0, -1, false);
        const retryJobIds = queuedJobs
            .map((job) => { var _a; return (_a = job.id) === null || _a === void 0 ? void 0 : _a.toString(); })
            .filter((id) => id === null || id === void 0 ? void 0 : id.startsWith(`${alarmId}-retry-`));
        await this.removeJobs(Array.from(new Set([...legacyJobIds, ...retryJobIds])), 'retry rescheduled');
    }
};
AlarmService = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, mongoose_1.InjectModel)(alarm_schema_1.Alarm.name)),
    __param(6, (0, bullmq_2.InjectQueue)('alarm')),
    __metadata("design:paramtypes", [livekit_service_1.LivekitService,
        apns_service_1.ApnsService,
        fcm_service_1.FcmService,
        user_service_1.UserService,
        prompt_service_1.PromptService,
        mongoose_2.Model,
        bullmq_1.Queue,
        config_1.ConfigService])
], AlarmService);
exports.AlarmService = AlarmService;
//# sourceMappingURL=alarm.service.js.map