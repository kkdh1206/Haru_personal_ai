import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AlarmService } from 'src/alarm/alarm.service';
import { CalendarService } from 'src/calendar/calendar.service';
import { MemoryService } from 'src/memory/memory.service';

type ControlIntent =
  | 'set_alarm'
  | 'update_memory'
  | 'get_info'
  | 'retry_request'
  | 'unknown';

@Injectable()
export class ControlService {
  constructor(
    private readonly alarmService: AlarmService,
    private readonly memoryService: MemoryService,
    private readonly calendarService: CalendarService,
  ) {}

  private classifyIntent(message: string): ControlIntent {
    if (/(부드럽게|강하게|세게|전화하지마|재전화|retry|톤|말투)/.test(message)) {
      return 'update_memory';
    }
    if (/(일정|알람 몇시|알람 시간|오늘 알람|내일 일정|오늘 일정)/.test(message)) {
      return 'get_info';
    }
    if (/(다시 전화|다시 걸어|이따 전화|few more minutes)/.test(message)) {
      return 'retry_request';
    }
    if (/(알람|깨워줘|일어나게|기상)/.test(message) && /(\d{1,2})\s*시/.test(message)) {
      return 'set_alarm';
    }
    return 'unknown';
  }

  private parseTime(message: string) {
    const match = message.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분?)?/);
    if (!match) {
      return null;
    }

    const hour = Math.max(0, Math.min(23, Number(match[1])));
    const minute = Math.max(0, Math.min(59, Number(match[2] || 0)));
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  async handleCommand(user: any, rawMessage: string) {
    const message = rawMessage.trim();
    const intent = this.classifyIntent(message);
    const timeZone = user.timeZone || 'Asia/Seoul';

    if (intent === 'set_alarm') {
      const time = this.parseTime(message);
      if (!time) {
        return {
          intent,
          success: false,
          reply: '알람 시간은 짧게 다시 말해 주세요. 예: 내일 7시에 깨워줘',
        };
      }

      const targetDate = /내일/.test(message)
        ? DateTime.now().setZone(timeZone).plus({ days: 1 }).toISODate()
        : undefined;
      const alarm = await this.alarmService.createAlarm(user._id.toString(), {
        time,
        targetDate,
        timeZone,
        repeatDays: [],
        isOn: true,
        wakeIntensity: 'gentle',
      });

      return {
        intent,
        success: true,
        reply: targetDate
          ? `내일 ${time} 알람으로 설정했어요.`
          : `${time} 알람으로 설정했어요.`,
        data: alarm,
      };
    }

    if (intent === 'update_memory') {
      const patch: {
        wakeStyle?: 'gentle' | 'aggressive';
        retryLimit?: number;
        toneNotes?: string[];
      } = {};

      if (/(강하게|세게|확실하게)/.test(message)) {
        patch.wakeStyle = 'aggressive';
      } else if (/(부드럽게|다정하게|gentle)/.test(message)) {
        patch.wakeStyle = 'gentle';
      }

      const retryMatch = message.match(/(\d+)\s*번/);
      if (retryMatch && /(전화하지마|재전화|retry)/.test(message)) {
        patch.retryLimit = Math.max(0, Math.min(3, Number(retryMatch[1])));
      } else if (/재전화 줄이기/.test(message)) {
        patch.retryLimit = 1;
      }

      if (!Object.keys(patch).length) {
        return {
          intent,
          success: false,
          reply: '바꿀 설정을 짧게 말해 주세요. 예: 부드럽게 깨워줘, 3번 이상 전화하지마',
        };
      }

      const profile = await this.memoryService.updateBehaviorProfile(
        user._id.toString(),
        patch,
      );

      return {
        intent,
        success: true,
        reply: '깨우기 설정을 업데이트했어요.',
        data: profile,
      };
    }

    if (intent === 'get_info') {
      if (/내일 일정/.test(message)) {
        const date = DateTime.now().setZone(timeZone).plus({ days: 1 }).toISODate();
        const schedule = await this.calendarService.getSchedule(
          user._id.toString(),
          date!,
        );
        return {
          intent,
          success: true,
          reply: schedule.length
            ? `내일 일정 ${schedule.length}개가 있어요.`
            : '내일 일정은 없어요.',
          data: schedule,
        };
      }

      if (/오늘 일정/.test(message)) {
        const date = DateTime.now().setZone(timeZone).toISODate();
        const schedule = await this.calendarService.getSchedule(
          user._id.toString(),
          date!,
        );
        return {
          intent,
          success: true,
          reply: schedule.length
            ? `오늘 일정 ${schedule.length}개가 있어요.`
            : '오늘 일정은 없어요.',
          data: schedule,
        };
      }

      const alarms = await this.alarmService.findAllAlarms(user._id.toString());
      const active = alarms.filter((alarm: any) => alarm.isOn);
      return {
        intent,
        success: true,
        reply: active.length
          ? `현재 켜진 알람은 ${active.map((alarm: any) => alarm.time).join(', ')}예요.`
          : '현재 켜진 알람이 없어요.',
        data: active,
      };
    }

    if (intent === 'retry_request') {
      return {
        intent,
        success: false,
        reply: '재통화 요청은 실제 통화 중에만 처리할 수 있어요.',
      };
    }

    return {
      intent,
      success: false,
      reply: '지원하는 건 알람 설정, 깨우기 방식 변경, 일정/알람 조회예요.',
    };
  }
}
