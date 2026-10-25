import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { AssistantService } from './assistant.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { CreateAssistantTaskDto } from './dto/create-assistant-task.dto';
import { UpdateAssistantTaskDto } from './dto/update-assistant-task.dto';

@ApiTags('Assistant')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Get('status')
  @ApiOperation({ summary: 'Configured assistant provider status' })
  getStatus() {
    return this.assistantService.getStatus();
  }

  @Get('briefing')
  @ApiOperation({ summary: 'Structured daily briefing for the current user' })
  getBriefing(@Req() req) {
    return this.assistantService.getBriefing(req.user);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List tasks for the current user' })
  getTasks(@Req() req, @Query('includeCompleted') includeCompleted?: string) {
    return this.assistantService.getTasks(
      req.user,
      includeCompleted?.toLowerCase() === 'true',
    );
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Create a task for the current user' })
  createTask(@Req() req, @Body() dto: CreateAssistantTaskDto) {
    return this.assistantService.createTask(req.user, dto);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Update a task owned by the current user' })
  updateTask(
    @Req() req,
    @Param('id') taskId: string,
    @Body() dto: UpdateAssistantTaskDto,
  ) {
    return this.assistantService.updateTask(req.user, taskId, dto);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Delete a task owned by the current user' })
  deleteTask(@Req() req, @Param('id') taskId: string) {
    return this.assistantService.deleteTask(req.user, taskId);
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with the personal assistant' })
  chat(@Req() req, @Body() dto: AssistantChatDto) {
    return this.assistantService.chat(req.user, dto);
  }
}
