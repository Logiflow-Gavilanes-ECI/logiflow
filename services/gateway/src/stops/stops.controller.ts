import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { StopsService } from './stops.service';
import { CreateStopDto } from './dto/create-stop.dto';
import { UpdateStopDto } from './dto/update-stop.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('stops')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StopsController {
  constructor(private readonly stopsService: StopsService) {}

  @Get()
  findAll() {
    return this.stopsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stopsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateStopDto) {
    return this.stopsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStopDto) {
    return this.stopsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.stopsService.remove(id);
  }

  @ApiOperation({
    summary: 'Mark a stop as completed',
    description:
      'Sets completedAt for the given stop. Idempotent — re-calling on an already-completed stop returns the existing record without changing the timestamp.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stop record with completedAt set.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Stop with the given id does not exist.',
  })
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Param('id') id: string) {
    return this.stopsService.complete(id);
  }
}
