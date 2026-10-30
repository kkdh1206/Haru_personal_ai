import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { CryptoService } from 'src/utils/crypto.service';
import { Alarm, AlarmDocument } from 'src/alarm/schemas/alarm.schema';
import { Memory, MemoryDocument } from 'src/memory/schemas/memory.schema';
import {
  UserProfile,
  UserProfileDocument,
} from 'src/memory/schemas/user-profile.schema';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as firebase from 'firebase-admin';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Alarm.name) private alarmModel: Model<AlarmDocument>,
    @InjectModel(Memory.name) private memoryModel: Model<MemoryDocument>,
    @InjectModel(UserProfile.name)
    private userProfileModel: Model<UserProfileDocument>,
    private readonly crypto: CryptoService,
    private readonly cs: ConfigService,
    @Optional()
    @InjectConnection()
    private readonly connection?: Connection,
  ) {}

  async oauthSync(firebaseUid: string, email?: string, displayName?: unknown) {
    const providerName =
      typeof displayName === 'string' ? displayName.trim() : '';
    let user = await this.userModel.findOne({ firebaseUid }).lean();
    if (user) {
      // Only fill an empty profile from the verified Firebase token. Keep names
      // users have chosen themselves, including during concurrent profile edits.
      if (!user.name?.trim() && providerName) {
        const updated = await this.userModel
          .findOneAndUpdate(
            {
              firebaseUid,
              $or: [
                { name: { $exists: false } },
                { name: null },
                { name: { $regex: '^\\s*$' } },
              ],
            },
            { $set: { name: providerName } },
            { new: true },
          )
          .lean();
        const currentUser =
          updated ?? (await this.userModel.findOne({ firebaseUid }).lean());
        if (!currentUser) throw new NotFoundException('User not found');
        return currentUser;
      }
      return user;
    }

    // A locally cached ID token can outlive a deleted Firebase account.
    // Verify the remote user before creating a new database record.
    const firebaseUser = await firebase.auth().getUser(firebaseUid);
    const name = providerName || firebaseUser.displayName?.trim();

    try {
      user = await this.userModel.create({
        firebaseUid,
        email: email ?? firebaseUser.email,
        ...(name ? { name } : {}),
      });
      return user;
    } catch (err) {
      if (err.code === 11000) {
        throw new ConflictException(
          'User already exists with this firebaseUid',
        );
      }
      throw err;
    }
  }

  async findOne(id: Types.ObjectId): Promise<User | null> {
    return this.userModel.findById(id).lean();
  }

  async update(userId: string, updateUserDto: UpdateUserDto) {
    const $set: Partial<User> = {};

    if (typeof updateUserDto.name === 'string') {
      const name = updateUserDto.name.trim();
      if (name) $set.name = name;
    }
    if (updateUserDto.interest !== undefined)
      $set.interest = updateUserDto.interest;
    if (updateUserDto.location !== undefined)
      $set.location = updateUserDto.location;
    if (updateUserDto.language !== undefined)
      $set.language = updateUserDto.language;
    if (updateUserDto.speechStyle !== undefined)
      $set.speechStyle = updateUserDto.speechStyle;

    return this.userModel
      .findByIdAndUpdate({ _id: userId }, { $set }, { new: true })
      .lean();
  }

  updateLocation(userId: string, location: string, timeZone?: string) {
    const $set: Partial<User> = { location };
    if (timeZone) $set.timeZone = timeZone;

    return this.userModel
      .findByIdAndUpdate({ _id: userId }, { $set }, { new: true })
      .lean();
  }

  updateTimeZone(userId: string, timeZone: string) {
    return this.userModel
      .findByIdAndUpdate({ _id: userId }, { $set: { timeZone } }, { new: true })
      .lean();
  }

  async updateCustomMessage(
    userId: string,
    newMessage: string,
  ): Promise<User | null> {
    const user = await this.userModel.findById(userId);
    if (!user) return null;

    user.customMessage = newMessage;
    return await user.save();
  }

  updateDeviceToken(
    userId: string,
    deviceToken: string,
    deviceType: 'ios' | 'android' = 'ios',
    notificationToken?: string,
    apnsEnvironment?: 'sandbox' | 'production',
  ) {
    const $set: Partial<User> = { deviceToken, deviceType };
    if (notificationToken) {
      $set.notificationToken = notificationToken;
    }
    if (deviceType === 'ios' && apnsEnvironment) {
      $set.apnsEnvironment = apnsEnvironment;
    }

    return this.userModel
      .findByIdAndUpdate({ _id: userId }, { $set }, { new: true })
      .lean();
  }

  getUserDeviceToken(userId: string) {
    return this.userModel
      .findById(userId)
      .select(
        'deviceToken notificationToken deviceType apnsEnvironment updatedAt',
      )
      .lean();
  }

  async reserveDailyCallSlot(
    userId: string,
    dateKey: string,
    maxCalls: number,
  ) {
    const limit = Math.max(1, maxCalls);

    await this.userModel.updateOne(
      {
        _id: userId,
        dailyCallTrackingDate: { $ne: dateKey },
      },
      {
        $set: {
          dailyCallTrackingDate: dateKey,
          dailyCallCount: 0,
        },
      },
    );

    const user = await this.userModel
      .findOneAndUpdate(
        {
          _id: userId,
          dailyCallTrackingDate: dateKey,
          dailyCallCount: { $lt: limit },
        },
        { $inc: { dailyCallCount: 1 } },
        { new: true },
      )
      .select('dailyCallCount')
      .lean();

    return {
      allowed: Boolean(user),
      count: user?.dailyCallCount ?? limit,
      limit,
    };
  }

  async reserveOnboardingTestCall(userId: string) {
    const reservationCutoff = new Date(Date.now() - 10 * 60 * 1000);
    const user = await this.userModel
      .findOneAndUpdate(
        {
          _id: userId,
          onboardingTestCallUsedAt: null,
          $or: [
            { onboardingTestCallReservedAt: null },
            { onboardingTestCallReservedAt: { $lt: reservationCutoff } },
          ],
        },
        { $set: { onboardingTestCallReservedAt: new Date() } },
        { new: true },
      )
      .select('_id')
      .lean();

    return Boolean(user);
  }

  async completeOnboardingTestCall(userId: string) {
    await this.userModel.updateOne(
      { _id: userId, onboardingTestCallUsedAt: null },
      {
        $set: { onboardingTestCallUsedAt: new Date() },
        $unset: { onboardingTestCallReservedAt: '' },
      },
    );
  }

  async releaseOnboardingTestCall(userId: string) {
    await this.userModel.updateOne(
      { _id: userId, onboardingTestCallUsedAt: null },
      { $unset: { onboardingTestCallReservedAt: '' } },
    );
  }

  async releaseDailyCallSlot(userId: string, dateKey: string) {
    await this.userModel.updateOne(
      {
        _id: userId,
        dailyCallTrackingDate: dateKey,
        dailyCallCount: { $gt: 0 },
      },
      { $inc: { dailyCallCount: -1 } },
    );
  }

  updateCalendarToken(
    userId: string,
    calendarAccessToken: string,
    calendarRefreshToken: string,
    options: { selectProvider?: boolean } = {},
  ) {
    return this.userModel
      .findByIdAndUpdate(
        { _id: userId },
        {
          $set: {
            calendarAccessToken: this.crypto.encrypt(calendarAccessToken),
            calendarRefreshToken: this.crypto.encrypt(calendarRefreshToken),
            // OAuth refresh is not a new user selection. An in-flight Google
            // request must not switch a user who has since connected Apple.
            ...(options.selectProvider === false
              ? {}
              : { calendarProvider: 'google' }),
          },
        },
        { new: true },
      )
      .lean();
  }

  async updateCalendarTokenFromAuthCode(
    userId: string,
    serverAuthCode: string,
  ) {
    const oAuth2Client = new google.auth.OAuth2(
      this.cs.get<string>('google.clientId'),
      this.cs.get<string>('google.clientSecret'),
    );

    const { tokens } = await oAuth2Client.getToken(serverAuthCode);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Google Calendar auth code did not return tokens.');
    }

    await this.updateCalendarToken(
      userId,
      tokens.access_token,
      tokens.refresh_token,
    );

    return { connected: true };
  }

  async getUserCalendarToken(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('calendarAccessToken calendarRefreshToken')
      .lean();
    if (!user) throw new NotFoundException('User not found');
    if (!user.calendarAccessToken || !user.calendarRefreshToken)
      throw new NotFoundException('Calendar token not found');
    return {
      calendarAccessToken: this.crypto.decrypt(user.calendarAccessToken),
      calendarRefreshToken: this.crypto.decrypt(user.calendarRefreshToken),
    };
  }

  async getCalendarStatus(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select(
        'calendarAccessToken calendarRefreshToken calendarProvider appleCalendarConnected appleCalendarLastSyncedAt',
      )
      .lean();
    if (!user) throw new NotFoundException('User not found');

    const googleConnected = Boolean(
      user.calendarAccessToken && user.calendarRefreshToken,
    );
    const appleConnected = Boolean(user.appleCalendarConnected);
    const provider =
      user.calendarProvider === 'apple' && appleConnected
        ? 'apple'
        : user.calendarProvider === 'google' && googleConnected
          ? 'google'
          : googleConnected
            ? 'google'
            : appleConnected
              ? 'apple'
              : null;

    return {
      connected: provider !== null,
      provider,
      googleConnected,
      appleConnected,
      lastSyncedAt:
        provider === 'apple' ? user.appleCalendarLastSyncedAt : null,
    };
  }

  async getCalendarProvider(userId: string) {
    const status = await this.getCalendarStatus(userId);
    return status.connected ? status.provider : null;
  }

  connectAppleCalendar(userId: string) {
    return this.userModel
      .findByIdAndUpdate(
        { _id: userId },
        {
          $set: {
            calendarProvider: 'apple',
            appleCalendarConnected: true,
          },
        },
        { new: true },
      )
      .lean();
  }

  markAppleCalendarSynced(userId: string, syncedAt: Date) {
    return this.userModel
      .findByIdAndUpdate(
        { _id: userId, appleCalendarConnected: true },
        { $set: { appleCalendarLastSyncedAt: syncedAt } },
        { new: true },
      )
      .lean();
  }

  disconnectAppleCalendar(userId: string) {
    return this.userModel
      .findByIdAndUpdate(
        { _id: userId },
        {
          $set: { appleCalendarConnected: false },
          $unset: {
            appleCalendarLastSyncedAt: '',
            calendarProvider: '',
          },
        },
        { new: true },
      )
      .lean();
  }

  disconnectCalendar(userId: string) {
    return this.userModel
      .findByIdAndUpdate(
        { _id: userId },
        {
          $unset: {
            calendarAccessToken: '',
            calendarRefreshToken: '',
            calendarProvider: '',
          },
        },
        { new: true },
      )
      .lean();
  }

  async deleteAccount(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('_id firebaseUid')
      .lean();
    if (!user) return null;

    try {
      await firebase.auth().deleteUser(user.firebaseUid);
    } catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') {
        throw error;
      }
    }

    const calendarUserId = this.connection ? new Types.ObjectId(userId) : null;
    const [
      alarms,
      memories,
      profile,
      appleCalendarEvents,
      pendingAppleCalendarEvents,
    ] = await Promise.all([
      this.alarmModel.deleteMany({ userId }),
      this.memoryModel.deleteMany({ userId }),
      this.userProfileModel.deleteOne({ userId }),
      calendarUserId
        ? this.connection
            .collection('apple_calendar_events')
            .deleteMany({ userId: calendarUserId })
        : Promise.resolve({ deletedCount: 0 }),
      calendarUserId
        ? this.connection
            .collection('pending_apple_calendar_events')
            .deleteMany({ userId: calendarUserId })
        : Promise.resolve({ deletedCount: 0 }),
    ]);

    const deletedUser = await this.userModel.findByIdAndDelete(userId).lean();
    if (!deletedUser) return null;

    return {
      status: 'deleted' as const,
      deleted: true,
      firebaseDeleted: true,
      deletedResources: {
        alarms: alarms.deletedCount,
        memories: memories.deletedCount,
        profile: profile.deletedCount,
        appleCalendarEvents: appleCalendarEvents.deletedCount,
        pendingAppleCalendarEvents: pendingAppleCalendarEvents.deletedCount,
      },
    };
  }
}
