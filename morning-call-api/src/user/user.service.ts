import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { CryptoService } from 'src/utils/crypto.service';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly crypto: CryptoService,
  ) {}

  async oauthSync(firebaseUid: string, email: string) {
    let user = await this.userModel.findOne({ firebaseUid }).lean();
    if (user) {
      return user;
    }
    try {
      user = await this.userModel.create({ firebaseUid, email });
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
    return this.userModel
      .findByIdAndUpdate(
        { _id: userId },
        {
          $set: {
            name: updateUserDto.name,
            interest: updateUserDto.interest,
            location: updateUserDto.location,
            language: updateUserDto.language,
          },
        },
        { new: true },
      )
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

  updateDeviceToken(userId: string, deviceToken: string) {
    return this.userModel
      .findByIdAndUpdate(
        { _id: userId },
        { $set: { deviceToken: deviceToken } },
        { new: true },
      )
      .lean();
  }

  getUserDeviceToken(userId: string) {
    return this.userModel.findById(userId).select('deviceToken').lean();
  }

  updateCalendarToken(
    userId: string,
    calendarAccessToken: string,
    calendarRefreshToken: string,
  ) {
    return this.userModel
      .findByIdAndUpdate(
        { _id: userId },
        {
          $set: {
            calendarAccessToken: this.crypto.encrypt(calendarAccessToken),
            calendarRefreshToken: this.crypto.encrypt(calendarRefreshToken),
          },
        },
        { new: true },
      )
      .lean();
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
}
